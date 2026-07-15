import { spawn, spawnSync, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { db, imagesTable } from "@workspace/db";
import { desc, sql, inArray } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveRelativePath(relFromDist: string, relFromSrcLib: string): string {
  const candidates = [
    path.resolve(__dirname, relFromDist),
    path.resolve(__dirname, relFromSrcLib),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0];
}

const BINARY_PATH = resolveRelativePath("../loon-bin", "../../loon-bin");
const DATA_DIR = resolveRelativePath("../loon-data", "../../loon-data");
const CONFIG_PATH = path.join(DATA_DIR, "config.yml");
const APP_CONFIG_PATH = path.join(DATA_DIR, "app-config.json");
export const IMG_STORE_DIR = path.join(DATA_DIR, "img-store");

fs.mkdirSync(IMG_STORE_DIR, { recursive: true });

const LOON_INTERNAL_PORT = 8889;
const MAX_LOG_LINES = 200;

interface AppConfig {
  username: string;
  password: string;
  maxContentSizeMb: number;
  cacheDurationSeconds: number;
  maxStoredImages: number;
}

const defaultAppConfig: AppConfig = {
  username: "loon",
  password: "hiccup",
  maxContentSizeMb: 16,
  cacheDurationSeconds: 30,
  maxStoredImages: 100,
};

let loonProcess: ChildProcess | null = null;
let startedAt: Date | null = null;
const logLines: string[] = [];

export function getDataDir(): string {
  return DATA_DIR;
}

export function getLoonPort(): number {
  return LOON_INTERNAL_PORT;
}

export function readAppConfig(): AppConfig {
  try {
    if (fs.existsSync(APP_CONFIG_PATH)) {
      const raw = fs.readFileSync(APP_CONFIG_PATH, "utf-8");
      return { ...defaultAppConfig, ...JSON.parse(raw) };
    }
  } catch (e) {
    logger.warn({ err: e }, "Failed to read app config, using defaults");
  }
  return { ...defaultAppConfig };
}

export function writeAppConfig(config: Partial<AppConfig>): AppConfig {
  const current = readAppConfig();
  const updated = { ...current, ...config };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(updated, null, 2));
  return updated;
}

function getPublicDomain(): string {
  const domains = process.env["REPLIT_DOMAINS"] ?? process.env["REPLIT_DEV_DOMAIN"] ?? "localhost";
  const domain = domains.split(",")[0]?.trim() ?? "localhost";
  return domain;
}

function getFrontendBaseUrl(): string {
  const domain = getPublicDomain();
  if (domain === "localhost") return `http://localhost:80/loon-img`;
  return `https://${domain}/loon-img`;
}

function getWsUrl(): string {
  const domain = getPublicDomain();
  if (domain === "localhost") return `ws://localhost:80/ws`;
  return `wss://${domain}/ws`;
}

function writeLoonConfig(): void {
  const appConfig = readAppConfig();
  const baseUrl = getFrontendBaseUrl();
  const cacheDuration = `${appConfig.cacheDurationSeconds}s`;
  const maxContentSize = appConfig.maxContentSizeMb * 1024 * 1024;

  const configContent = `protocol:
  base_url: ${baseUrl}
  chunk_buffer_size: 8
  constraints:
    chunk_size: 65536
    max_content_size: ${maxContentSize}
    accepted_content_types:
      - image/png
      - image/jpeg
      - text/plain
      - text/html
    cache_duration: ${cacheDuration}
  intervals:
    write_wait: 10s
    pong_wait: 120s
    ping_interval: 54s
    timeout_duration: 3600s
    timeout_interval: 60s
http:
  write_timeout: 30s
  read_timeout: 10s
  idle_timeout: 30s
log:
  level: INFO
`;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, configContent);
}

function appendLog(line: string): void {
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) {
    logLines.splice(0, logLines.length - MAX_LOG_LINES);
  }
}

export function getLogs(): string[] {
  return [...logLines];
}

export async function recordImage(record: {
  url: string;
  contentType: string;
  servedAt: string;
  filename: string;
  sizeBytes?: number | null;
}): Promise<void> {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  try {
    await db.insert(imagesTable).values({
      id,
      url: record.url,
      contentType: record.contentType,
      servedAt: new Date(record.servedAt),
      filename: record.filename,
      sizeBytes: record.sizeBytes ?? null,
    });
    // Run cleanup after each insert (non-blocking)
    cleanupOldImages().catch((e) => logger.warn({ err: e }, "Post-insert cleanup failed"));
  } catch (e) {
    logger.warn({ err: e }, "Failed to persist image record to DB");
  }
}

export async function getImageHistory() {
  try {
    const rows = await db
      .select()
      .from(imagesTable)
      .orderBy(desc(imagesTable.servedAt))
      .limit(200);
    return rows.map((r) => ({
      id: r.id,
      url: r.url,
      contentType: r.contentType,
      servedAt: r.servedAt.toISOString(),
      filename: r.filename,
      sizeBytes: r.sizeBytes ?? null,
    }));
  } catch (e) {
    logger.warn({ err: e }, "Failed to load image history from DB");
    return [];
  }
}

export async function clearImageHistory(): Promise<number> {
  try {
    // Also delete all stored files
    try {
      const files = fs.readdirSync(IMG_STORE_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(IMG_STORE_DIR, file));
      }
    } catch (e) {
      logger.warn({ err: e }, "Failed to clear img-store files");
    }
    const result = await db
      .delete(imagesTable)
      .returning({ id: imagesTable.id });
    return result.length;
  } catch (e) {
    logger.warn({ err: e }, "Failed to clear image history from DB");
    return 0;
  }
}

export async function cleanupOldImages(): Promise<void> {
  const config = readAppConfig();
  const maxImages = config.maxStoredImages ?? 100;
  try {
    const allImages = await db
      .select({ id: imagesTable.id, url: imagesTable.url })
      .from(imagesTable)
      .orderBy(desc(imagesTable.servedAt));

    if (allImages.length <= maxImages) return;

    const toDelete = allImages.slice(maxImages);
    const idsToDelete = toDelete.map((img) => img.id);

    // Delete DB records
    await db.delete(imagesTable).where(inArray(imagesTable.id, idsToDelete));

    // Delete files from disk
    for (const img of toDelete) {
      try {
        const storageFilename = img.url.split("/").pop();
        if (storageFilename) {
          const filePath = path.join(IMG_STORE_DIR, storageFilename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      } catch (e) {
        logger.warn({ err: e, url: img.url }, "Failed to delete image file");
      }
    }

    logger.info({ deleted: toDelete.length, kept: maxImages }, "Cleaned up old images");
  } catch (e) {
    logger.warn({ err: e }, "Image cleanup failed");
  }
}

export async function getImageStorageBytes(): Promise<number> {
  try {
    const result = await db
      .select({ total: sql<number>`coalesce(sum(${imagesTable.sizeBytes}), 0)` })
      .from(imagesTable);
    return Number(result[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

export async function getImageCount(): Promise<number> {
  try {
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(imagesTable);
    return Number(result[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

export function isRunning(): boolean {
  return loonProcess !== null && !loonProcess.killed && loonProcess.exitCode === null;
}

export function getPid(): number | null {
  return loonProcess?.pid ?? null;
}

export function getUptime(): number | null {
  if (!startedAt) return null;
  return Math.floor((Date.now() - startedAt.getTime()) / 1000);
}

export function getStatus() {
  return {
    running: isRunning(),
    pid: getPid(),
    wsUrl: getWsUrl(),
    frontendBaseUrl: getFrontendBaseUrl(),
    username: readAppConfig().username,
    uptime: getUptime(),
  };
}

async function ensureBinary(): Promise<void> {
  if (fs.existsSync(BINARY_PATH)) {
    try { fs.accessSync(BINARY_PATH, fs.constants.X_OK); } catch { fs.chmodSync(BINARY_PATH, 0o755); }
    return;
  }
  appendLog("[loon binary missing — building from source, please wait ~60s...]");
  logger.info({ binaryPath: BINARY_PATH }, "loon binary not found, building from source");
  const srcDir = "/tmp/loon-build-src";
  if (!fs.existsSync(srcDir)) {
    const clone = spawnSync("git", ["clone", "--depth=1", "https://github.com/ungive/loon", srcDir], {
      stdio: ["ignore", "pipe", "pipe"], timeout: 90000,
    });
    if (clone.status !== 0) throw new Error(`git clone failed: ${clone.stderr?.toString().trim()}`);
  }
  const build = spawnSync(
    "go", ["build", "-ldflags=-extldflags \"-static\"", "-o", BINARY_PATH, "./cmd/loon"],
    { cwd: srcDir, stdio: ["ignore", "pipe", "pipe"], timeout: 180000, env: { ...process.env, CGO_ENABLED: "0" } }
  );
  if (build.status !== 0) throw new Error(`go build failed: ${build.stderr?.toString().trim()}`);
  fs.chmodSync(BINARY_PATH, 0o755);
  appendLog("[loon binary built successfully]");
  logger.info({ binaryPath: BINARY_PATH }, "loon binary built successfully");
}

export async function startLoon(): Promise<void> {
  if (isRunning()) { logger.info("Loon is already running"); return; }
  await ensureBinary();
  writeLoonConfig();

  loonProcess = spawn(BINARY_PATH, ["server", "-addr", `:${LOON_INTERNAL_PORT}`, "-config", CONFIG_PATH], {
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  startedAt = new Date();

  loonProcess.stdout?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    appendLog(line);
    logger.info({ source: "loon" }, line);
  });
  loonProcess.stderr?.on("data", (data: Buffer) => {
    const line = data.toString().trim();
    appendLog(`[ERR] ${line}`);
    logger.warn({ source: "loon" }, line);
  });
  loonProcess.on("exit", (code, signal) => {
    appendLog(`[loon exited: code=${code} signal=${signal}]`);
    logger.info({ code, signal }, "Loon process exited");
    loonProcess = null;
    startedAt = null;
  });
  loonProcess.on("error", (err) => {
    appendLog(`[loon error: ${err.message}]`);
    logger.error({ err }, "Loon process error");
    loonProcess = null;
    startedAt = null;
  });

  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  logger.info({ port: LOON_INTERNAL_PORT }, "Loon server started");
}

export async function stopLoon(): Promise<void> {
  if (!loonProcess) { logger.info("Loon is not running"); return; }
  loonProcess.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => { loonProcess?.kill("SIGKILL"); resolve(); }, 5000);
    loonProcess!.on("exit", () => { clearTimeout(timeout); resolve(); });
  });
  loonProcess = null;
  startedAt = null;
}

export async function restartLoonIfRunning(): Promise<boolean> {
  if (!isRunning()) return false;
  logger.info("Config changed — restarting loon to apply new settings");
  appendLog("[config changed — restarting loon...]");
  await stopLoon();
  await startLoon();
  return true;
}

// Periodic cleanup every 15 minutes
setInterval(() => {
  cleanupOldImages().catch((e) => logger.warn({ err: e }, "Periodic cleanup failed"));
}, 15 * 60 * 1000);
