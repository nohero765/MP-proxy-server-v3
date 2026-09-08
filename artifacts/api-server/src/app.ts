import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import net from "net";
import pinoHttp from "pino-http";
import session from "express-session";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { createProxyMiddleware } from "http-proxy-middleware";
import { getLoonPort, recordImage, IMG_STORE_DIR } from "./lib/loon-manager.js";
import { checkImageRateLimit, recordActivity, recordTraffic } from "./lib/activity.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env["SESSION_SECRET"] ?? "dev-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false, // proxied via Replit; TLS is terminated upstream
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  }),
);

app.use("/api", router);

function getPublicUrl(storageFilename: string): string {
  const publicDomain = (process.env["REPLIT_DOMAINS"] ?? process.env["REPLIT_DEV_DOMAIN"] ?? "localhost").split(",")[0]?.trim() ?? "localhost";
  const protocol = publicDomain === "localhost" ? "http" : "https";
  return `${protocol}://${publicDomain}/api/loon/img-store/${storageFilename}`;
}

// Deduplicate streaming cover fetches: URL → timestamp last stored
const streamingCoverCache = new Map<string, number>();
const STREAMING_COVER_TTL_MS = 60 * 1000; // don't re-fetch the same URL within 60 s
const MAX_STREAMING_COVER_BYTES = 10 * 1024 * 1024;

function isSafeStreamingCoverUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (url.username || url.password) return false;

    const hostname = url.hostname.toLowerCase();
    if (
      hostname === "localhost" ||
      hostname === "localhost.localdomain" ||
      hostname.endsWith(".localhost") ||
      hostname === "metadata.google.internal" ||
      hostname === "169.254.169.254"
    ) return false;

    // Reject private/link-local literal IPs. Hostname DNS rebinding is still
    // handled by the platform network boundary, but obvious internal targets
    // should never be fetched from a cover-art response.
    const ipVersion = net.isIP(hostname);
    if (ipVersion === 4) {
      const octets = hostname.split(".").map(Number);
      const [a, b] = octets;
      if (
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168)
      ) return false;
    }
    if (ipVersion === 6 && (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd") || hostname.startsWith("fe80:"))) {
      return false;
    }

    return rawUrl.length <= 4096;
  } catch {
    return false;
  }
}

async function fetchAndStoreStreamingCover(cdnUrl: string): Promise<void> {
  if (!isSafeStreamingCoverUrl(cdnUrl)) {
    logger.warn({ cdnUrl }, "Rejected unsafe streaming cover URL");
    return;
  }

  const now = Date.now();
  const last = streamingCoverCache.get(cdnUrl);
  if (last && now - last < STREAMING_COVER_TTL_MS) return;
  streamingCoverCache.set(cdnUrl, now);

  try {
    const cdnRes = await fetch(cdnUrl, { signal: AbortSignal.timeout(10_000) });
    const cdnContentType = cdnRes.headers.get("content-type") ?? "";
    const isImg =
      cdnContentType.includes("image/png") ||
      cdnContentType.includes("image/jpeg") ||
      cdnContentType.includes("image/gif") ||
      cdnContentType.includes("image/webp");
    if (!isImg || !cdnRes.ok) return;
    const contentLength = Number(cdnRes.headers.get("content-length") ?? 0);
    if (contentLength > MAX_STREAMING_COVER_BYTES) {
      logger.warn({ cdnUrl, contentLength }, "Rejected oversized streaming cover");
      return;
    }

    const buffer = Buffer.from(await cdnRes.arrayBuffer());
    if (buffer.length > MAX_STREAMING_COVER_BYTES) {
      logger.warn({ cdnUrl, sizeBytes: buffer.length }, "Rejected oversized streaming cover");
      return;
    }
    const ext = cdnContentType.includes("png") ? "png"
      : cdnContentType.includes("gif") ? "gif"
      : cdnContentType.includes("webp") ? "webp"
      : "jpg";
    const storageFilename = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}.${ext}`;
    const storagePath = path.join(IMG_STORE_DIR, storageFilename);

    fs.writeFile(storagePath, buffer, (err) => {
      if (err) logger.warn({ err }, "Failed to save streaming cover to disk");
    });
    recordImage({
      url: getPublicUrl(storageFilename),
      contentType: cdnContentType.split(";")[0]?.trim() ?? cdnContentType,
      servedAt: new Date().toISOString(),
      filename: cdnUrl.split("/").pop()?.split("?")[0] ?? "streaming-cover",
      sizeBytes: buffer.length,
    });
    recordActivity("image", "Streaming cover art received", "Fetched cover art from the music CDN");
    logger.info({ cdnUrl }, "Stored streaming cover art from CDN");
  } catch (e) {
    logger.warn({ err: e, cdnUrl }, "Failed to fetch streaming cover art from CDN");
  }
}

const loonProxy = createProxyMiddleware({
  target: `http://localhost:${getLoonPort()}`,
  changeOrigin: true,
  pathRewrite: { "^/loon-img": "" },
  selfHandleResponse: true,
  on: {
    proxyRes: async (proxyRes, req, res) => {
      const contentType = proxyRes.headers["content-type"] ?? "application/octet-stream";
      const isImage =
        contentType.includes("image/png") ||
        contentType.includes("image/jpeg") ||
        contentType.includes("image/gif") ||
        contentType.includes("image/webp");
      const isText = contentType.includes("text/plain");

      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value != null) (res as Response).setHeader(key, value as string | string[]);
      }
      (res as Response).statusCode = proxyRes.statusCode ?? 200;

      if (proxyRes.statusCode === 200 && (isImage || isText)) {
        // Buffer the full body for both image and text/plain (CDN URL) responses
        const chunks: Buffer[] = [];
        try {
          for await (const chunk of proxyRes) {
            chunks.push(chunk as Buffer);
          }
        } catch (streamErr: unknown) {
          const code = (streamErr as NodeJS.ErrnoException).code;
          if (code === "ERR_STREAM_PREMATURE_CLOSE" || code === "ECONNRESET") {
            logger.warn({ code }, "Image stream closed early by client — skipping record");
            if (!(res as Response).headersSent) (res as Response).end();
            return;
          }
          throw streamErr;
        }
        const buffer = Buffer.concat(chunks);

        if (isImage) {
          // Store proxied image directly
          const url = req.url ?? "";
          const originalFilename = url.split("/").pop()?.split("?")[0] ?? "image";
          const ext = contentType.includes("png") ? "png"
            : contentType.includes("gif") ? "gif"
            : contentType.includes("webp") ? "webp"
            : "jpg";
          const storageFilename = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}.${ext}`;
          const storagePath = path.join(IMG_STORE_DIR, storageFilename);

          fs.writeFile(storagePath, buffer, (err) => {
            if (err) logger.warn({ err }, "Failed to save image to local store");
          });
          recordImage({
            url: getPublicUrl(storageFilename),
            contentType: contentType.split(";")[0]?.trim() ?? contentType,
            servedAt: new Date().toISOString(),
            filename: originalFilename,
            sizeBytes: buffer.length,
          });
          recordActivity("image", "Cover art received", originalFilename);
        } else if (isText) {
          // Loon sends CDN URLs as text/plain for streaming songs —
          // fetch and store the actual image in the background
          const text = buffer.toString("utf-8").trim();
          if (text.startsWith("http://") || text.startsWith("https://")) {
            fetchAndStoreStreamingCover(text).catch(() => {});
          }
        }

        (res as Response).setHeader("content-length", buffer.length);
        (res as Response).end(buffer);
      } else {
        proxyRes.pipe(res as Response);
      }
    },
    error: (_err, _req, res) => {
      const r = res as Response;
      if (!r.headersSent) {
        r.status(502).json({ error: "Loon server unavailable" });
      } else {
        r.end();
      }
    },
  },
});

app.use("/loon-img", (req: Request, res: Response, next: NextFunction) => {
  const forwardedFor = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  const clientKey = forwardedFor || req.socket.remoteAddress || "unknown";
  const rate = checkImageRateLimit(clientKey);
  res.setHeader("X-RateLimit-Limit", rate.limit);
  res.setHeader("X-RateLimit-Remaining", rate.remaining);
  if (!rate.allowed) {
    res.setHeader("Retry-After", rate.retryAfterSeconds);
    res.status(429).json({ error: "Too many image requests", retryAfterSeconds: rate.retryAfterSeconds });
    return;
  }

  res.once("finish", () => {
    const contentType = String(res.getHeader("content-type") ?? "");
    const contentLength = Number(res.getHeader("content-length") ?? 0);
    recordTraffic(contentLength, contentType.startsWith("image/"));
  });
  loonProxy(req, res, next);
});

const wsProxy = createProxyMiddleware({
  target: `http://localhost:${getLoonPort()}`,
  changeOrigin: true,
  ws: true,
  on: {
    error: (err, _req, res) => {
      logger.warn({ err }, "WebSocket proxy error");
      if (res && "writeHead" in res && typeof (res as Response).headersSent !== "undefined") {
        const r = res as Response;
        if (!r.headersSent) {
          r.status(502).json({ error: "Loon WebSocket unavailable" });
        }
      }
    },
  },
});

app.use("/ws", (req: Request, res: Response, next: NextFunction) => {
  wsProxy(req, res, next);
});

export default app;
export { loonProxy, wsProxy };
