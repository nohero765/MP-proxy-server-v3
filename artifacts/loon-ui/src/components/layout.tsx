import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Settings, LayoutDashboard } from "lucide-react";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background text-foreground dark selection:bg-primary/30">
      <aside className="w-full md:w-64 border-r border-border bg-card p-6 flex flex-col gap-8">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-mono text-sm">L</span>
            LOON PROXY
          </h1>
          <p className="text-muted-foreground text-sm mt-1 font-mono">v0.1.0 // ONLINE</p>
        </div>

        <nav className="flex flex-col gap-2">
          <Link href="/" className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${location === "/" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>
          <Link href="/settings" className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${location === "/settings" ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
            <Settings className="w-4 h-4" />
            Settings
          </Link>
        </nav>
      </aside>

      <main className="flex-1 overflow-auto p-6 md:p-10">
        <div className="max-w-6xl mx-auto space-y-10">
          {children}
        </div>
      </main>
    </div>
  );
}
