import { useState } from "react";
import { Radio, Lock } from "lucide-react";

export default function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        onLogin();
      } else {
        setError("Incorrect password");
        setPassword("");
      }
    } catch {
      setError("Connection error — is the server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-animated-mesh dark flex items-center justify-center p-6">
      {/* Subtle glow */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 40% at 50% 30%, rgba(0, 204, 204, 0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8 select-none">
          <div
            className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "rgba(0, 204, 204, 0.1)",
              border: "1px solid rgba(0, 204, 204, 0.3)",
            }}
          >
            <Radio className="w-5 h-5 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary animate-glow-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-widest text-primary uppercase leading-none">
              Loon Proxy
            </h1>
            <p className="text-muted-foreground/60 text-[10px] font-mono mt-0.5 tracking-wider">
              MUSIC PRESENCE
            </p>
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="glass-card rounded-2xl p-8 space-y-6"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">
                Dashboard access
              </h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your password to unlock the dashboard.
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="w-full px-4 py-2.5 bg-black/30 border border-white/[0.08] rounded-lg text-sm font-mono focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all text-foreground placeholder:text-muted-foreground/30"
              placeholder="••••••••"
            />
            {error && (
              <p className="text-xs text-destructive font-mono animate-in fade-in duration-200">
                {error}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full py-2.5 rounded-lg font-mono text-sm font-bold tracking-widest uppercase transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed text-black"
            style={{
              background: "rgb(0, 204, 204)",
              boxShadow: "0 0 24px rgba(0, 204, 204, 0.25)",
            }}
          >
            {loading ? "Verifying…" : "Unlock"}
          </button>
        </form>
      </div>
    </div>
  );
}
