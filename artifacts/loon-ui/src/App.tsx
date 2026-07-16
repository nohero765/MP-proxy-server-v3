import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Settings from "@/pages/settings";
import LoginPage from "@/pages/login";
import { Layout } from "@/components/layout";
import { useState, useEffect, useCallback } from "react";

const queryClient = new QueryClient();

function Router({ onLogout }: { onLogout: () => void }) {
  return (
    <Layout onLogout={onLogout}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/status`, {
        credentials: "include",
      });
      const data = (await res.json()) as { authenticated: boolean };
      setAuthenticated(data.authenticated);
    } catch {
      // server unreachable — show login so user sees something useful
    }
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Dark background while auth check is in-flight
  if (!authChecked) {
    return <div className="min-h-screen bg-background dark" />;
  }

  if (!authenticated) {
    return <LoginPage onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router onLogout={() => setAuthenticated(false)} />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
