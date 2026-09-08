export type ActivityType = "server" | "client" | "image" | "config" | "security";

export type ActivityEvent = {
  id: string;
  type: ActivityType;
  message: string;
  detail?: string;
  createdAt: string;
};

const MAX_ACTIVITY_EVENTS = 100;
const RATE_WINDOW_MS = 60_000;
const IMAGE_REQUESTS_PER_MINUTE = 180;

const activityEvents: ActivityEvent[] = [];
const rateWindows = new Map<string, { startedAt: number; count: number }>();

let trafficRequests = 0;
let trafficBytes = 0;
let trafficImages = 0;
let rateLimitedRequests = 0;
let lastTrafficAt: string | null = null;
let lastCleanupAt = 0;

function addActivity(type: ActivityType, message: string, detail?: string): void {
  activityEvents.push({
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`,
    type,
    message,
    ...(detail ? { detail } : {}),
    createdAt: new Date().toISOString(),
  });
  if (activityEvents.length > MAX_ACTIVITY_EVENTS) {
    activityEvents.splice(0, activityEvents.length - MAX_ACTIVITY_EVENTS);
  }
}

export function recordActivity(type: ActivityType, message: string, detail?: string): void {
  addActivity(type, message, detail);
}

export function getActivity(limit = 50): ActivityEvent[] {
  return activityEvents.slice(-Math.max(1, Math.min(limit, MAX_ACTIVITY_EVENTS))).reverse();
}

export function checkImageRateLimit(clientKey: string): {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  let window = rateWindows.get(clientKey);
  if (!window || now - window.startedAt >= RATE_WINDOW_MS) {
    window = { startedAt: now, count: 0 };
    rateWindows.set(clientKey, window);
  }

  window.count++;
  if (window.count > IMAGE_REQUESTS_PER_MINUTE) {
    rateLimitedRequests++;
    if (rateLimitedRequests === 1 || rateLimitedRequests % 25 === 0) {
      addActivity("security", "Image request rate limit reached", "A client exceeded the per-minute image threshold");
    }
    return {
      allowed: false,
      limit: IMAGE_REQUESTS_PER_MINUTE,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((window.startedAt + RATE_WINDOW_MS - now) / 1000)),
    };
  }

  return {
    allowed: true,
    limit: IMAGE_REQUESTS_PER_MINUTE,
    remaining: Math.max(0, IMAGE_REQUESTS_PER_MINUTE - window.count),
    retryAfterSeconds: 0,
  };
}

export function recordTraffic(bytes: number, isImage: boolean): void {
  trafficRequests++;
  trafficBytes += Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (isImage) trafficImages++;
  lastTrafficAt = new Date().toISOString();
}

export function getTrafficMetrics() {
  const now = Date.now();
  if (now - lastCleanupAt > RATE_WINDOW_MS * 5) {
    for (const [key, window] of rateWindows) {
      if (now - window.startedAt >= RATE_WINDOW_MS) rateWindows.delete(key);
    }
    lastCleanupAt = now;
  }

  let currentWindowRequests = 0;
  for (const window of rateWindows.values()) {
    if (now - window.startedAt < RATE_WINDOW_MS) currentWindowRequests += window.count;
  }

  return {
    trafficRequests,
    trafficBytes,
    trafficImages,
    rateLimitedRequests,
    currentWindowRequests,
    rateLimitPerMinute: IMAGE_REQUESTS_PER_MINUTE,
    lastTrafficAt,
  };
}