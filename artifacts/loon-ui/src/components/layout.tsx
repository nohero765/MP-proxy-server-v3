import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Settings, LayoutDashboard, Radio, LogOut } from "lucide-react";

const ACCENT = "0, 204, 204"; // fallback — overridden by --accent-rgb on :root

function accentRgb(alpha = 1) {
  return `rgba(var(--accent-rgb, ${ACCENT}), ${alpha})`;
}

export function Layout({
  children,
  onLogout,
}: {
  children: ReactNode;
  onLogout?: () => void;
}) {
  const [location] = useLocation();

  const handleLogout = async () => {
    try {
      await fetch(`${import.meta.env.BASE_URL}api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      onLogout?.();
    }
  };

  const navLink = (href: string, label: string, Icon: React.ElementType) => {
    const active = location === href;
    return (
      <Link
        href={href}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
          active
            ? "font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-white/5"
        }`}
        style={
          active
            ? {
                background: accentRgb(0.12),
                color: accentRgb(1),
                border: `1px solid ${accentRgb(0.2)}`,
                boxShadow: `0 0 12px ${accentRgb(0.08)}`,
              }
            : {}
        }
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-animated-mesh text-foreground dark selection:bg-primary/30">
      {/* Sidebar */}
      <aside className="glass-sidebar w-full md:w-60 md:min-h-screen p-5 flex flex-col gap-8 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 select-none">
          <div
            className="relative w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: accentRgb(0.1),
              border: `1px solid ${accentRgb(0.3)}`,
            }}
          >
            <Radio className="w-4 h-4" style={{ color: accentRgb(1) }} />
            <span
              className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full animate-glow-pulse"
              style={{ background: accentRgb(1) }}
            />
          </div>
          <div>
            <h1
              className="text-sm font-bold tracking-widest uppercase leading-none"
              style={{ color: accentRgb(1) }}
            >
              Loon Proxy
            </h1>
            <p className="text-muted-foreground/60 text-[10px] font-mono mt-0.5 tracking-wider">
              MUSIC PRESENCE
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1.5">
          {navLink("/", "Dashboard", LayoutDashboard)}
          {navLink("/settings", "Settings", Settings)}
        </nav>

        {/* Footer */}
        <div className="mt-auto flex flex-col gap-3">
          {onLogout && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all w-full text-left"
            >
              <LogOut className="w-4 h-4 shrink-0" />
              Sign out
            </button>
          )}
          <p className="text-muted-foreground/30 text-[10px] font-mono">v0.1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">{children}</div>
      </main>
    </div>
  );
}
