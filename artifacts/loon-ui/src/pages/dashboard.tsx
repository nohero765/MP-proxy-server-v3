import {
  useGetLoonStatus, useStartLoon, useStopLoon,
  useGetLoonImages, useClearLoonImages,
  useGetLoonLogs, useGetLoonMetrics,
  getGetLoonStatusQueryKey, getGetLoonImagesQueryKey,
  getGetLoonLogsQueryKey, getGetLoonMetricsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Power, PowerOff, Copy, Trash2, Image as ImageIcon,
  Users, X, ExternalLink, Activity, ChevronDown, Cpu,
  HardDrive, MemoryStick, Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState, useMemo, useCallback } from "react";

function formatUptime(seconds: number | null) {
  if (!seconds) return "0h 0m 0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function parseLogLine(raw: string): { time: string; level: string; msg: string; extra?: string } | null {
  try {
    const obj = JSON.parse(raw);
    const time = obj.time ? new Date(obj.time).toLocaleTimeString() : "";
    const level = (obj.level ?? "INFO").toUpperCase();
    const msg = obj.msg ?? raw;
    const extras: string[] = [];
    if (obj.client_id) extras.push(`id=${obj.client_id.slice(0, 8)}`);
    if (obj.active_clients !== undefined) extras.push(`clients=${obj.active_clients}`);
    if (obj.path) extras.push(`path=${obj.path}`);
    return { time, level, msg, extra: extras.join(" ") };
  } catch {
    return { time: "", level: "INFO", msg: raw };
  }
}

function getActiveClients(logLines: string[]): number {
  for (let i = logLines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(logLines[i]);
      if (obj.active_clients !== undefined) return Number(obj.active_clients);
    } catch { /* not JSON */ }
  }
  return 0;
}

type ImageEntry = {
  id: string; url: string; filename: string;
  contentType: string; servedAt: string; sizeBytes?: number | null;
};

type ImageDims = { w: number; h: number };

function ImageLightbox({ image, onClose }: { image: ImageEntry | null; onClose: () => void }) {
  const [dims, setDims] = useState<ImageDims | null>(null);

  useEffect(() => { setDims(null); }, [image?.id]);

  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black/95 border-border">
        {image && (
          <div className="flex flex-col">
            <div className="relative">
              <img
                src={image.url}
                alt={image.filename}
                className="w-full max-h-[65vh] object-contain"
                onLoad={(e) => {
                  const el = e.currentTarget;
                  setDims({ w: el.naturalWidth, h: el.naturalHeight });
                }}
              />
              <button onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 border-t border-border space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <p className="font-mono text-sm text-foreground truncate">{image.filename}</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground font-mono">
                    <span>{image.contentType}</span>
                    {dims && <span>{dims.w} × {dims.h} px</span>}
                    {image.sizeBytes != null && <span className="text-primary">{formatBytes(image.sizeBytes)}</span>}
                    <span>{formatDistanceToNow(new Date(image.servedAt), { addSuffix: true })}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => window.open(image.url, "_blank")} className="shrink-0">
                  <ExternalLink className="w-4 h-4 mr-2" /> Open
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MetricsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: metrics } = useGetLoonMetrics({
    query: {
      queryKey: getGetLoonMetricsQueryKey(),
      refetchInterval: 2000,
      refetchIntervalInBackground: true,
    }
  });

  const memPct = metrics ? Math.round((metrics.memUsedBytes / metrics.memTotalBytes) * 100) : 0;
  const diskPct = metrics ? Math.round((metrics.diskUsedBytes / metrics.diskTotalBytes) * 100) : 0;
  const cpuPct = metrics?.cpuUsagePercent ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-mono text-primary flex items-center gap-2">
            <Activity className="w-5 h-5" /> System Metrics
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <MetricRow
            icon={<Cpu className="w-4 h-4 text-cyan-400" />}
            label="CPU Usage"
            value={`${cpuPct.toFixed(1)}%`}
            pct={cpuPct}
            color={cpuPct > 80 ? "bg-red-500" : cpuPct > 50 ? "bg-yellow-500" : "bg-emerald-500"}
          />
          <MetricRow
            icon={<MemoryStick className="w-4 h-4 text-violet-400" />}
            label="Memory"
            value={`${formatBytes(metrics?.memUsedBytes)} / ${formatBytes(metrics?.memTotalBytes)}`}
            pct={memPct}
            color={memPct > 85 ? "bg-red-500" : memPct > 60 ? "bg-yellow-500" : "bg-violet-500"}
          />
          <MetricRow
            icon={<HardDrive className="w-4 h-4 text-orange-400" />}
            label="Process RSS"
            value={`${formatBytes(metrics?.diskUsedBytes)} of ${formatBytes(metrics?.diskTotalBytes)} heap`}
            pct={diskPct}
            color={diskPct > 90 ? "bg-red-500" : diskPct > 70 ? "bg-yellow-500" : "bg-orange-500"}
          />
          <div className="border-t border-border pt-4 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Image Storage" value={formatBytes(metrics?.imageStorageBytes)} />
            <Stat label="Cached Images" value={`${metrics?.imageCount ?? 0}`} />
            <Stat label="Node.js Uptime" value={formatUptime(Math.round(metrics?.nodeUptimeSeconds ?? 0))} icon={<Clock className="w-3 h-3" />} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MetricRow({ icon, label, value, pct, color }: { icon: React.ReactNode; label: string; value: string; pct: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">{icon}{label}</span>
        <span className="font-mono text-foreground">{value}</span>
      </div>
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-secondary/40 rounded p-2.5 space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-mono text-sm font-medium flex items-center gap-1">{icon}{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const logsViewportRef = useRef<HTMLDivElement>(null);
  const [lightboxImage, setLightboxImage] = useState<ImageEntry | null>(null);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [imageDims, setImageDims] = useState<Map<string, ImageDims>>(new Map());

  const { data: status } = useGetLoonStatus({
    query: { queryKey: getGetLoonStatusQueryKey(), refetchInterval: 2000, refetchIntervalInBackground: true }
  });
  const { data: images } = useGetLoonImages({
    query: { queryKey: getGetLoonImagesQueryKey(), refetchInterval: 5000, refetchIntervalInBackground: true }
  });
  const { data: logs } = useGetLoonLogs({
    query: { queryKey: getGetLoonLogsQueryKey(), refetchInterval: 2000, refetchIntervalInBackground: true }
  });
  const { data: metrics } = useGetLoonMetrics({
    query: { queryKey: getGetLoonMetricsQueryKey(), refetchInterval: 2000, refetchIntervalInBackground: true }
  });

  const startMutation = useStartLoon();
  const stopMutation = useStopLoon();
  const clearImagesMutation = useClearLoonImages();

  const logLines = useMemo(() => {
    const rawLines = logs?.lines ?? [];
    const result: string[] = [];
    for (const line of rawLines) {
      let remaining = line.trim();
      while (remaining.startsWith("{")) {
        let depth = 0, end = -1;
        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i] === "{") depth++;
          else if (remaining[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
        }
        if (end === -1) { result.push(remaining); break; }
        result.push(remaining.slice(0, end + 1));
        remaining = remaining.slice(end + 1).trim();
      }
      if (remaining.length > 0 && !remaining.startsWith("{")) result.push(remaining);
    }
    return result;
  }, [logs?.lines]);

  const activeClients = useMemo(() => getActiveClients(logLines), [logLines]);
  const parsedLogs = useMemo(() => logLines.map(parseLogLine), [logLines]);

  const cpuPct = metrics?.cpuUsagePercent ?? 0;
  const load = useMemo(() => {
    if (cpuPct === 0 && activeClients === 0) return { label: "IDLE", pct: 4, color: "bg-muted-foreground/40" };
    if (cpuPct < 30 && activeClients <= 1) return { label: "LOW", pct: Math.max(8, cpuPct), color: "bg-emerald-500" };
    if (cpuPct < 65) return { label: "MEDIUM", pct: cpuPct, color: "bg-yellow-500" };
    return { label: "HIGH", pct: Math.min(100, cpuPct), color: "bg-red-500" };
  }, [cpuPct, activeClients]);

  const totalStorageBytes = useMemo(() => {
    if (!images) return 0;
    return images.reduce((sum, img) => sum + (img.sizeBytes ?? 0), 0);
  }, [images]);

  useEffect(() => {
    const el = logsViewportRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logLines.length]);

  const handleImageLoad = useCallback((id: string, w: number, h: number) => {
    setImageDims(prev => {
      if (prev.get(id)?.w === w && prev.get(id)?.h === h) return prev;
      const next = new Map(prev);
      next.set(id, { w, h });
      return next;
    });
  }, []);

  const handleToggle = () => {
    if (status?.running) {
      stopMutation.mutate(undefined, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetLoonStatusQueryKey() }); toast({ title: "Server stopped" }); }
      });
    } else {
      startMutation.mutate(undefined, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetLoonStatusQueryKey() }); toast({ title: "Server started" }); }
      });
    }
  };

  const handleClearImages = () => {
    clearImagesMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetLoonImagesQueryKey() });
        setImageDims(new Map());
        toast({ title: "History cleared" });
      }
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Status card */}
        <Card className="col-span-1 md:col-span-2 bg-card border-border shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                Server Status
                {status?.running ? (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary mr-1.5 animate-pulse" /> RUNNING
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-destructive mr-1.5" /> STOPPED
                  </Badge>
                )}
              </CardTitle>
              <span className="font-mono text-xs text-muted-foreground">{formatUptime(status?.uptime ?? null)}</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="flex items-center justify-center py-5 bg-secondary/30 rounded-lg border border-border/50">
              <Button
                size="lg"
                variant={status?.running ? "destructive" : "default"}
                className={`w-40 h-12 text-base font-mono tracking-widest uppercase transition-all ${status?.running ? "hover:bg-destructive/90 shadow-[0_0_20px_rgba(255,0,0,0.25)]" : "hover:bg-primary/90 shadow-[0_0_20px_rgba(0,255,255,0.2)]"}`}
                onClick={handleToggle}
                disabled={startMutation.isPending || stopMutation.isPending}
              >
                {status?.running ? <><PowerOff className="w-4 h-4 mr-2" />STOP</> : <><Power className="w-4 h-4 mr-2" />START</>}
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-secondary/40 rounded-lg p-3 border border-border/40 space-y-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="w-3.5 h-3.5" /> Connected
                </div>
                <p className={`text-2xl font-mono font-bold ${activeClients > 0 ? "text-primary" : "text-foreground"}`}>{activeClients}</p>
              </div>
              <div className="bg-secondary/40 rounded-lg p-3 border border-border/40 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Activity className="w-3.5 h-3.5" /> Server Load
                  </div>
                  <button
                    onClick={() => setMetricsOpen(true)}
                    className="text-muted-foreground/50 hover:text-primary transition-colors"
                    title="View detailed metrics"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className={`text-2xl font-mono font-bold ${load.label === "HIGH" ? "text-red-400" : load.label === "MEDIUM" ? "text-yellow-400" : load.label === "LOW" ? "text-emerald-400" : "text-muted-foreground"}`}>
                  {load.label}
                </p>
                <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${load.color}`} style={{ width: `${load.pct}%` }} />
                </div>
                <p className="text-xs font-mono text-muted-foreground/60">{cpuPct.toFixed(1)}% CPU</p>
              </div>
            </div>

            {status?.wsUrl && (
              <div className="space-y-1.5">
                <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">WebSocket URL</label>
                <div className="flex gap-2">
                  <code className="flex-1 px-3 py-2 bg-secondary text-secondary-foreground rounded text-xs overflow-hidden text-ellipsis whitespace-nowrap border border-border">
                    {status.wsUrl}
                  </code>
                  <Button variant="secondary" size="sm" onClick={() => copyToClipboard(status.wsUrl, "WebSocket URL")}>
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Logs card */}
        <Card className="col-span-1 md:col-span-3 bg-card border-border shadow-sm flex flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Terminal Logs</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 p-0">
            <div
              ref={logsViewportRef}
              className="h-[380px] overflow-y-auto w-full bg-black/50 font-mono text-xs rounded-b-lg"
            >
              <div className="p-4 space-y-1.5">
                {parsedLogs.length > 0 ? parsedLogs.map((entry, i) => {
                  if (!entry) return null;
                  const levelColor = entry.level === "ERROR" ? "text-red-400" : entry.level === "WARN" ? "text-yellow-400" : "text-primary/70";
                  return (
                    <div key={i} className="flex gap-2 opacity-75 hover:opacity-100 transition-opacity leading-relaxed">
                      {entry.time && <span className="text-muted-foreground/40 shrink-0 tabular-nums">{entry.time}</span>}
                      <span className={`shrink-0 font-bold ${levelColor}`}>{entry.level}</span>
                      <span className="text-slate-300 break-all">
                        {entry.msg}
                        {entry.extra && <span className="text-muted-foreground/50 ml-1.5">({entry.extra})</span>}
                      </span>
                    </div>
                  );
                }) : (
                  <div className="text-muted-foreground/40 italic">No recent logs...</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cover art section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight">Recent Cover Art</h2>
            {images && images.length > 0 && (
              <Badge variant="secondary" className="font-mono">{images.length}</Badge>
            )}
          </div>
          {images && images.length > 0 && (
            <div className="flex items-center gap-3">
              {totalStorageBytes > 0 && (
                <span className="text-sm text-muted-foreground font-mono">
                  <HardDrive className="w-3.5 h-3.5 inline mr-1.5 text-muted-foreground/60" />
                  {formatBytes(totalStorageBytes)} stored
                </span>
              )}
              <Button variant="outline" size="sm" onClick={handleClearImages} disabled={clearImagesMutation.isPending}>
                <Trash2 className="w-4 h-4 mr-2" /> Clear History
              </Button>
            </div>
          )}
        </div>

        {images && images.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {images.map(image => {
              const dims = imageDims.get(image.id);
              return (
                <Card
                  key={image.id}
                  className="overflow-hidden bg-card border-border hover:border-primary/50 transition-colors group cursor-pointer"
                  onClick={() => setLightboxImage(image as ImageEntry)}
                >
                  <div className="aspect-square w-full bg-secondary relative overflow-hidden">
                    <img
                      src={image.url}
                      alt={image.filename}
                      className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      onLoad={(e) => {
                        const el = e.currentTarget;
                        handleImageLoad(image.id, el.naturalWidth, el.naturalHeight);
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2.5 gap-0.5">
                      {image.sizeBytes != null && (
                        <span className="text-xs text-primary font-mono font-bold leading-tight">{formatBytes(image.sizeBytes)}</span>
                      )}
                      {dims && (
                        <span className="text-xs text-white/70 font-mono leading-tight">{dims.w} × {dims.h}</span>
                      )}
                    </div>
                  </div>
                  <div className="px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(image.servedAt), { addSuffix: true })}
                    </span>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed border-2 border-border bg-transparent">
            <CardContent className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground h-64">
              <div className="w-12 h-12 mb-4 rounded-full bg-secondary flex items-center justify-center">
                <ImageIcon className="w-6 h-6 opacity-50" />
              </div>
              <p className="font-medium text-foreground mb-1">No cover art yet</p>
              <p className="text-sm max-w-md">Connect your Music Presence client to start seeing album art pass through the proxy.</p>
            </CardContent>
          </Card>
        )}
      </div>

      <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />
      <MetricsModal open={metricsOpen} onClose={() => setMetricsOpen(false)} />
    </div>
  );
}
