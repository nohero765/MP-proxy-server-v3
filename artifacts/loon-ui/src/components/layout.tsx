import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Settings, LayoutDashboard, Radio } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-animated-mesh text-foreground dark selection:bg-primary/30">
      {/* Sidebar */}
      <aside className="glass-sidebar w-full md:w-60 md:min-h-screen p-5 flex flex-col gap-8 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 select-none">
          <div className="relative w-9 h-9 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary animate-glow-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest text-primary uppercase leading-none">Loon Proxy</h1>
            <p className="text-muted-foreground/60 text-[10px] font-mono mt-0.5 tracking-wider">MUSIC PRESENCE</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-1.5">
          <Link
            href="/"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              location === "/"
                ? "bg-primary/15 text-primary font-medium border border-primary/20 shadow-[0_0_12px_rgba(0,204,204,0.1)]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            Dashboard
          </Link>
          <Link
            href="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              location === "/settings"
                ? "bg-primary/15 text-primary font-medium border border-primary/20 shadow-[0_0_12px_rgba(0,204,204,0.1)]"
                : "text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            Settings
          </Link>
        </nav>

        {/* Footer */}
        <div className="mt-auto">
          <p className="text-muted-foreground/30 text-[10px] font-mono">v0.1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6 md:p-8">
        <div className="max-w-6xl mx-auto space-y-8">
          {children}
        </div>
      </main>
    </div>
  );
}
