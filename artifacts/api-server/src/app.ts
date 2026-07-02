import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import pinoHttp from "pino-http";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";
import { createProxyMiddleware } from "http-proxy-middleware";
import { getLoonPort, recordImage, IMG_STORE_DIR } from "./lib/loon-manager.js";

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
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

function getPublicUrl(storageFilename: string): string {
  const publicDomain = (process.env["REPLIT_DOMAINS"] ?? process.env["REPLIT_DEV_DOMAIN"] ?? "localhost").split(",")[0]?.trim() ?? "localhost";
  const protocol = publicDomain === "localhost" ? "http" : "https";
  return `${protocol}://${publicDomain}/api/loon/img-store/${storageFilename}`;
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

      for (const [key, value] of Object.entries(proxyRes.headers)) {
        if (value != null) (res as Response).setHeader(key, value as string | string[]);
      }
      (res as Response).statusCode = proxyRes.statusCode ?? 200;

      if (isImage && proxyRes.statusCode === 200) {
        const chunks: Buffer[] = [];
        try {
          for await (const chunk of proxyRes) {
            chunks.push(chunk as Buffer);
          }
        } catch (streamErr: unknown) {
          const code = (streamErr as NodeJS.ErrnoException).code;
          if (code === "ERR_STREAM_PREMATURE_CLOSE" || code === "ECONNRESET") {
            logger.warn({ code }, "Image stream closed early by client — skipping record");
            if (!((res as Response).headersSent)) (res as Response).end();
            return;
          }
          throw streamErr;
        }
        const buffer = Buffer.concat(chunks);

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
