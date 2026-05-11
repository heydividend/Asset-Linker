import { useState } from "react";
import {
  useListResources,
  useCreateResource,
  useDeleteResource,
  useListRecommendedResources,
  useListDomains,
  useListTopics,
  getListResourcesQueryKey,
  getListRecommendedResourcesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AskAiButton } from "@/components/AskAiButton";
import { useToast } from "@/hooks/use-toast";
import { Library, Plus, ExternalLink, Trash2, Sparkles } from "lucide-react";

const KINDS = ["article", "video", "podcast", "book", "paper", "guideline", "other"] as const;

export default function ResourcesPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterKind, setFilterKind] = useState<string>("all");
  const params: Record<string, string> = {};
  if (filterKind !== "all") params.kind = filterKind;
  const { data: resources = [] } = useListResources(params, { query: { queryKey: [...getListResourcesQueryKey(params)] } });
  const { data: recommended = [] } = useListRecommendedResources({ query: { queryKey: getListRecommendedResourcesQueryKey() } });
  const { data: domains = [] } = useListDomains();
  const { data: topics = [] } = useListTopics();
  const create = useCreateResource();
  const del = useDeleteResource();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", url: "", kind: "article", provider: "", topicId: "", domainId: "", notes: "" });

  const onCreate = () => {
    const title = form.title.trim();
    const url = form.url.trim();
    if (!title) {
      toast({ title: "Title is required", description: "Add a short title so you can find this later.", variant: "destructive" });
      return;
    }
    if (!url) {
      toast({ title: "URL is required", description: "Paste the link to the article, video, or paper.", variant: "destructive" });
      return;
    }
    try {
      new URL(url);
    } catch {
      toast({ title: "That doesn't look like a valid URL", description: "Include the protocol, e.g. https://example.com/article.", variant: "destructive" });
      return;
    }
    const data: Record<string, unknown> = { title, url, kind: form.kind };
    if (form.provider.trim()) data.provider = form.provider.trim();
    if (form.topicId) data.topicId = Number(form.topicId);
    if (form.domainId) data.domainId = Number(form.domainId);
    if (form.notes.trim()) data.notes = form.notes.trim();
    create.mutate({ data: data as Parameters<typeof create.mutate>[0]["data"] }, {
      onSuccess: () => {
        setOpen(false);
        setForm({ title: "", url: "", kind: "article", provider: "", topicId: "", domainId: "", notes: "" });
        qc.invalidateQueries({ queryKey: getListResourcesQueryKey() });
        qc.invalidateQueries({ queryKey: getListRecommendedResourcesQueryKey() });
        toast({ title: "Resource saved", description: title });
      },
      onError: (e) => {
        toast({
          title: "Couldn't save resource",
          description: e instanceof Error ? e.message : "Try again in a moment.",
          variant: "destructive",
        });
      },
    });
  };

  const onDelete = (id: number, title: string) => {
    if (del.isPending) return;
    if (!confirm(`Delete "${title}"?`)) return;
    del.mutate({ id }, {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListResourcesQueryKey() });
        qc.invalidateQueries({ queryKey: getListRecommendedResourcesQueryKey() });
        toast({ title: "Resource deleted", description: title });
      },
      onError: (e) => {
        toast({
          title: "Couldn't delete resource",
          description: e instanceof Error ? e.message : "Try again in a moment.",
          variant: "destructive",
        });
      },
    });
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center justify-between gap-2 px-4">
        <h1 className="text-base font-semibold flex items-center gap-2 min-w-0 truncate">
          <Library className="h-4 w-4 shrink-0" /> Resources
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          <Select value={filterKind} onValueChange={setFilterKind}>
            <SelectTrigger className="w-28 h-8 text-xs" data-testid="select-filter-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-resource"><Plus className="h-4 w-4 mr-1" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add a resource</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="input-resource-title" />
                <Input placeholder="URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} data-testid="input-resource-url" />
                <Input placeholder="Provider (optional)" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} data-testid="input-resource-provider" />
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger data-testid="select-resource-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={form.domainId || "none"} onValueChange={(v) => setForm({ ...form, domainId: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-resource-domain"><SelectValue placeholder="Domain (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No domain</SelectItem>
                    {domains.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.code} — {d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={form.topicId || "none"} onValueChange={(v) => setForm({ ...form, topicId: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-resource-topic"><SelectValue placeholder="Topic (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No topic</SelectItem>
                    {topics.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Textarea placeholder="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} data-testid="input-resource-notes" />
                <Button onClick={onCreate} disabled={create.isPending} data-testid="button-save-resource">
                  {create.isPending ? "Saving…" : "Save"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-5xl mx-auto w-full">
        {recommended.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" /> Recommended for you
            </h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {recommended.map((r) => (
                <ResourceCard key={r.id} r={r} onDelete={onDelete} deletePending={del.isPending} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">All resources</h2>
          {resources.length === 0 ? (
            <p className="text-xs text-muted-foreground">No resources yet. Add one above.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {resources.map((r) => <ResourceCard key={r.id} r={r} onDelete={onDelete} deletePending={del.isPending} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ResourceCard({ r, onDelete, deletePending }: { r: { id: number; title: string; url: string; kind: string; provider?: string | null; notes?: string | null }; onDelete: (id: number, title: string) => void; deletePending?: boolean }) {
  return (
    <Card data-testid={`resource-${r.id}`} className="overflow-hidden">
      <CardHeader className="p-3 pb-1.5">
        <CardTitle className="text-sm flex items-start justify-between gap-2 min-w-0">
          <span className="truncate flex-1 min-w-0" title={r.title}>{r.title}</span>
          <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">{r.kind}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 p-3 pt-0">
        {r.provider && <p className="text-[11px] text-muted-foreground truncate">{r.provider}</p>}
        {r.notes && <p className="text-xs line-clamp-3">{r.notes}</p>}
        <div className="flex items-center gap-1.5 flex-wrap">
          <a href={r.url} target="_blank" rel="noreferrer" className="text-[11px] text-primary inline-flex items-center gap-1 hover:underline" data-testid={`link-resource-${r.id}`}>
            <ExternalLink className="h-3 w-3 shrink-0" /> Open
          </a>
          <AskAiButton context={`Help me get the most out of this resource: "${r.title}" at ${r.url}. What should I focus on for the BOC?`} size="icon" variant="ghost" className="h-6 w-6" />
          <Button variant="ghost" size="icon" onClick={() => onDelete(r.id, r.title)} disabled={deletePending} className="h-6 w-6 ml-auto" data-testid={`button-delete-resource-${r.id}`}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
