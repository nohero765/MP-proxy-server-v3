import { Router } from "express";
import path from "path";
import fs from "fs";
import {
  getStatus,
  startLoon,
  stopLoon,
  getImageHistory,
  clearImageHistory,
  readAppConfig,
  writeAppConfig,
  restartLoonIfRunning,
  getLogs,
  getImageStorageBytes,
  getImageCount,
  IMG_STORE_DIR,
} from "../lib/loon-manager.js";
import { measureCpuPercent, getMemoryStats, getDiskStats, getNodeUptime } from "../lib/metrics.js";

const router = Router();

router.get("/loon/status", (_req, res) => {
  res.json(getStatus());
});

router.post("/loon/start", async (req, res) => {
  try {
    await startLoon();
    res.json(getStatus());
  } catch (err) {
    req.log.error({ err }, "Failed to start loon");
    res.status(500).json({ error: String(err) });
  }
});

router.post("/loon/stop", async (req, res) => {
  try {
    await stopLoon();
    res.json(getStatus());
  } catch (err) {
    req.log.error({ err }, "Failed to stop loon");
    res.status(500).json({ error: String(err) });
  }
});

router.get("/loon/images", async (_req, res) => {
  res.json(await getImageHistory());
});

router.delete("/loon/images", async (_req, res) => {
  const cleared = await clearImageHistory();
  res.json({ cleared });
});

router.get("/loon/config", (_req, res) => {
  res.json(readAppConfig());
});

router.put("/loon/config", async (req, res) => {
  const { username, password, maxContentSizeMb, cacheDurationSeconds, maxStoredImages } = req.body as Record<string, unknown>;
  const updated = writeAppConfig({
    ...(username !== undefined && { username: String(username) }),
    ...(password !== undefined && { password: String(password) }),
    ...(maxContentSizeMb !== undefined && { maxContentSizeMb: Number(maxContentSizeMb) }),
    ...(cacheDurationSeconds !== undefined && { cacheDurationSeconds: Number(cacheDurationSeconds) }),
    ...(maxStoredImages !== undefined && { maxStoredImages: Number(maxStoredImages) }),
  });
  const restarted = await restartLoonIfRunning();
  res.json({ ...updated, restarted });
});

router.get("/loon/img-store/:filename", (req, res) => {
  const { filename } = req.params;
  if (!filename || !/^[\w.-]+$/.test(filename)) {
    res.status(400).json({ error: "Invalid filename" });
    return;
  }
  const filePath = path.join(IMG_STORE_DIR, filename);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Files are content-addressed (random names) — cache aggressively
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.sendFile(filePath);
});

router.get("/loon/logs", (_req, res) => {
  res.json({ lines: getLogs() });
});

router.get("/loon/metrics", async (_req, res) => {
  const mem = getMemoryStats();
  const disk = getDiskStats();
  const [imageStorageBytes, imageCount] = await Promise.all([
    getImageStorageBytes(),
    getImageCount(),
  ]);
  res.json({
    cpuUsagePercent: measureCpuPercent(),
    memUsedBytes: mem.usedBytes,
    memTotalBytes: mem.totalBytes,
    diskUsedBytes: disk.usedBytes,
    diskTotalBytes: disk.totalBytes,
    imageStorageBytes,
    imageCount,
    nodeUptimeSeconds: getNodeUptime(),
  });
});

export default router;
