import os from "os";

let lastCpuMeasure: { idle: number; total: number } | null = null;

function getCpuSample(): { idle: number; total: number } {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const [type, time] of Object.entries(cpu.times)) {
      total += time;
      if (type === "idle") idle += time;
    }
  }
  return { idle, total };
}

export function measureCpuPercent(): number {
  const current = getCpuSample();
  if (!lastCpuMeasure) {
    lastCpuMeasure = current;
    return 0;
  }
  const idleDiff = current.idle - lastCpuMeasure.idle;
  const totalDiff = current.total - lastCpuMeasure.total;
  lastCpuMeasure = current;
  if (totalDiff === 0) return 0;
  return Math.round((1 - idleDiff / totalDiff) * 1000) / 10;
}

export function getMemoryStats(): { usedBytes: number; totalBytes: number } {
  const total = os.totalmem();
  const free = os.freemem();
  return { usedBytes: total - free, totalBytes: total };
}

export function getDiskStats(): { usedBytes: number; totalBytes: number } {
  const mem = process.memoryUsage();
  return { usedBytes: mem.rss, totalBytes: mem.heapTotal + mem.external + mem.arrayBuffers };
}

export function getNodeUptime(): number {
  return process.uptime();
}

setInterval(() => { measureCpuPercent(); }, 2000);
