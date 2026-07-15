import { useGetLoonConfig, useUpdateLoonConfig, useGetLoonStatus, getGetLoonConfigQueryKey, getGetLoonStatusQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Copy, Save } from "lucide-react";

const configSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  maxContentSizeMb: z.coerce.number().min(1, "Must be at least 1 MB"),
  cacheDurationSeconds: z.coerce.number().min(0, "Cannot be negative"),
  maxStoredImages: z.coerce.number().min(1, "Must keep at least 1 image").max(1000, "Max 1000 images"),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: config } = useGetLoonConfig({ query: { queryKey: getGetLoonConfigQueryKey() } });
  const { data: status } = useGetLoonStatus({ query: { queryKey: getGetLoonStatusQueryKey() } });

  const updateMutation = useUpdateLoonConfig();

  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      username: "",
      password: "",
      maxContentSizeMb: 16,
      cacheDurationSeconds: 30,
      maxStoredImages: 100,
    }
  });

  useEffect(() => {
    if (config) {
      form.reset({
        username: config.username,
        password: config.password,
        maxContentSizeMb: config.maxContentSizeMb,
        cacheDurationSeconds: config.cacheDurationSeconds,
        maxStoredImages: config.maxStoredImages ?? 100,
      });
    }
  }, [config, form]);

  const onSubmit = (values: ConfigFormValues) => {
    updateMutation.mutate({ data: values }, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getGetLoonConfigQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetLoonStatusQueryKey() });
        const restarted = (data as Record<string, unknown>)?.restarted === true;
        toast({
          title: "Configuration saved",
          description: restarted
            ? "Settings applied — loon server restarted automatically."
            : "Settings saved. Changes will apply on next start.",
        });
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update configuration.", variant: "destructive" });
      }
    });
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: `${label} copied to clipboard.` });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Settings</h2>
        <p className="text-muted-foreground">Configure proxy behaviour and get connection details for Music Presence.</p>
      </div>

      <Card className="glass-card border-0 shadow-lg">
        <CardHeader>
          <CardTitle>Proxy Configuration</CardTitle>
          <CardDescription>Server restarts automatically when configuration changes while running.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Username</FormLabel>
                      <FormControl>
                        <Input className="bg-black/30 border-white/[0.08] font-mono" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Password</FormLabel>
                      <FormControl>
                        <Input type="password" className="bg-black/30 border-white/[0.08] font-mono" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxContentSizeMb"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Max Content Size (MB)</FormLabel>
                      <FormControl>
                        <Input type="number" className="bg-black/30 border-white/[0.08] font-mono" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-muted-foreground/60">Maximum image size loon will accept.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="cacheDurationSeconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Cache Duration (Seconds)</FormLabel>
                      <FormControl>
                        <Input type="number" className="bg-black/30 border-white/[0.08] font-mono" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-muted-foreground/60">How long loon caches each image.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="maxStoredImages"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Max Stored Images</FormLabel>
                      <FormControl>
                        <Input type="number" className="bg-black/30 border-white/[0.08] font-mono" {...field} />
                      </FormControl>
                      <FormDescription className="text-xs text-muted-foreground/60">Oldest images are deleted automatically when this limit is reached.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <Button type="submit" className="font-mono uppercase tracking-widest" disabled={updateMutation.isPending}>
                <Save className="w-4 h-4 mr-2" /> Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="glass-card border border-primary/15 shadow-[0_0_40px_rgba(0,204,204,0.06)]">
        <CardHeader>
          <CardTitle className="text-primary">Connection Details</CardTitle>
          <CardDescription>Use these details to configure your Music Presence client.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">WebSocket URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={status?.wsUrl || "Loading..."} className="bg-black/30 border-white/[0.08] font-mono text-primary" />
              <Button variant="secondary" onClick={() => status?.wsUrl && copyToClipboard(status.wsUrl, "WebSocket URL")} className="bg-white/[0.06] hover:bg-white/[0.1] border-0">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-mono text-xs text-muted-foreground uppercase tracking-wider">Frontend Base URL (For Discord)</Label>
            <div className="flex gap-2">
              <Input readOnly value={status?.frontendBaseUrl || "Loading..."} className="bg-black/30 border-white/[0.08] font-mono" />
              <Button variant="secondary" onClick={() => status?.frontendBaseUrl && copyToClipboard(status.frontendBaseUrl, "Frontend Base URL")} className="bg-white/[0.06] hover:bg-white/[0.1] border-0">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="bg-black/20 p-4 rounded-xl border border-white/[0.06]">
            <h4 className="text-sm font-semibold mb-3">Music Presence Setup Instructions</h4>
            <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-1.5 ml-1">
              <li>Open Music Presence Settings</li>
              <li>Go to <strong className="text-foreground">Discord › Services</strong> and scroll to "Custom cover proxy server"</li>
              <li>Paste the <strong className="text-foreground">WebSocket URL</strong> into the "Websocket URL" field</li>
              <li>Paste the <strong className="text-foreground">Frontend Base URL</strong> into "Frontend base URL"</li>
              <li>Enter your username and password from the config above</li>
              <li>Check <strong className="text-foreground">"Disable TLS verification"</strong> if using a self-signed cert</li>
              <li>Make sure the Loon server is <strong className="text-primary">RUNNING</strong> on the dashboard</li>
              <li>Hit <strong className="text-foreground">Save</strong> and check the status message</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
