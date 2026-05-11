import { useState } from "react";
import {
  useGetScraperAllowlist,
  useCreateScrapeJob,
  useListScrapeJobs,
  getListScrapeJobsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PenTool, ShieldCheck, ShieldX, Globe, Loader2, CheckCircle2, XCircle, Plus } from "lucide-react";

const statusStyles: Record<string, { className: string; Icon: typeof Loader2 }> = {
  pending: { className: "bg-muted text-muted-foreground", Icon: Loader2 },
  running: { className: "bg-chart-2/10 text-chart-2 border-chart-2/30", Icon: Loader2 },
  complete: { className: "bg-primary/10 text-primary border-primary/30", Icon: CheckCircle2 },
  blocked: { className: "bg-destructive/10 text-destructive border-destructive/30", Icon: ShieldX },
  failed: { className: "bg-destructive/10 text-destructive border-destructive/30", Icon: XCircle },
};

export default function ScraperPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: allow } = useGetScraperAllowlist();
  const create = useCreateScrapeJob();
  const [url, setUrl] = useState("");

  const { data: jobs = [] } = useListScrapeJobs({
    query: {
      queryKey: getListScrapeJobsQueryKey(),
      refetchInterval: (q) => {
        const data = q.state.data as { status: string }[] | undefined;
        const anyPending = data?.some((j) => j.status === "pending" || j.status === "running");
        return anyPending ? 3000 : false;
      },
    },
  });

  const onSubmit = () => {
    if (!url.trim()) return;
    create.mutate(
      { data: { url: url.trim() } },
      {
        onSuccess: () => {
          setUrl("");
          qc.invalidateQueries({ queryKey: getListScrapeJobsQueryKey() });
          toast({ title: "Submitted", description: "We'll process this shortly." });
        },
        onError: (e: unknown) => toast({ title: "Could not submit", description: String(e), variant: "destructive" }),
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center px-6">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <PenTool className="h-5 w-5" /> Import from the web
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">
        <Card className="border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-5 w-5 text-primary" /> Public, allow-listed sources only
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>To respect copyright and exam policy, this importer only accepts URLs from these public clinical sources:</p>
            <div className="flex flex-wrap gap-2">
              {(allow?.allowed ?? []).map((host: string) => (
                <Badge key={host} variant="outline" className="font-mono text-xs">
                  <Globe className="h-3 w-3 mr-1" /> {host}
                </Badge>
              ))}
            </div>
            <p className="text-muted-foreground">Paid prep products and BOC-official content are refused. If you have purchased material, upload your PDF through the AI Tutor chat (paperclip icon) instead.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Submit a URL</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="https://www.ncbi.nlm.nih.gov/..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && onSubmit()}
                data-testid="input-scrape-url"
              />
              <Button onClick={onSubmit} disabled={!url.trim() || create.isPending} data-testid="button-submit-scrape">
                <Plus className="h-4 w-4 mr-1" /> Submit
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent jobs</CardTitle></CardHeader>
          <CardContent>
            {jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs yet.</p>
            ) : (
              <div className="space-y-2">
                {jobs.map((j) => {
                  const s = statusStyles[j.status] ?? statusStyles.pending;
                  return (
                    <div key={j.id} className="p-3 border rounded-md space-y-2" data-testid={`scrape-job-${j.id}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-mono truncate flex-1">{j.url}</span>
                        <Badge variant="outline" className={s.className}>
                          <s.Icon className={`h-3 w-3 mr-1 ${j.status === "running" || j.status === "pending" ? "animate-spin" : ""}`} />
                          {j.status}
                        </Badge>
                      </div>
                      {j.message && <p className="text-xs text-muted-foreground">{j.message}</p>}
                      {(j.importedCount ?? 0) > 0 && <p className="text-xs">Imported: {j.importedCount}{(j.pendingReviewCount ?? 0) > 0 ? ` · Pending review: ${j.pendingReviewCount}` : ""}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
