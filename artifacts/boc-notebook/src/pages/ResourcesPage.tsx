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
import { Library, Plus, ExternalLink, Trash2, Sparkles } from "lucide-react";

const KINDS = ["article", "video", "podcast", "book", "paper", "guideline", "other"] as const;

export default function ResourcesPage() {
  const qc = useQueryClient();
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
    if (!form.title || !form.url) return;
    const data: Record<string, unknown> = { title: form.title, url: form.url, kind: form.kind };
    if (form.provider) data.provider = form.provider;
    if (form.topicId) data.topicId = Number(form.topicId);
    if (form.domainId) data.domainId = Number(form.domainId);
    if (form.notes) data.notes = form.notes;
    create.mutate({ data: data as Parameters<typeof create.mutate>[0]["data"] }, {
      onSuccess: () => {
        setOpen(false);
        setForm({ title: "", url: "", kind: "article", provider: "", topicId: "", domainId: "", notes: "" });
        qc.invalidateQueries({ queryKey: getListResourcesQueryKey() });
      },
    });
  };

  const onDelete = (id: number) => {
    if (!confirm("Delete this resource?")) return;
    del.mutate({ id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getListResourcesQueryKey() }) });
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center justify-between px-6">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Library className="h-5 w-5" /> Resources
        </h1>
        <div className="flex items-center gap-2">
          <Select value={filterKind} onValueChange={setFilterKind}>
            <SelectTrigger className="w-40" data-testid="select-filter-kind"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {KINDS.map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-resource"><Plus className="h-4 w-4 mr-1" /> Add resource</Button>
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
                <Button onClick={onCreate} disabled={create.isPending} data-testid="button-save-resource">Save</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        {recommended.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
              <Sparkles className="h-4 w-4" /> Recommended for you
            </h2>
            <div className="grid md:grid-cols-2 gap-3">
              {recommended.map((r) => (
                <ResourceCard key={r.id} r={r} onDelete={onDelete} />
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">All resources</h2>
          {resources.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resources yet. Add one above.</p>
          ) : (
            <div className="grid md:grid-cols-2 gap-3">
              {resources.map((r) => <ResourceCard key={r.id} r={r} onDelete={onDelete} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ResourceCard({ r, onDelete }: { r: { id: number; title: string; url: string; kind: string; provider?: string | null; notes?: string | null }; onDelete: (id: number) => void }) {
  return (
    <Card data-testid={`resource-${r.id}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-start justify-between gap-2">
          <span className="truncate">{r.title}</span>
          <Badge variant="outline" className="shrink-0">{r.kind}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {r.provider && <p className="text-xs text-muted-foreground">{r.provider}</p>}
        {r.notes && <p className="text-sm">{r.notes}</p>}
        <div className="flex items-center gap-2 flex-wrap">
          <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline truncate" data-testid={`link-resource-${r.id}`}>
            <ExternalLink className="h-3 w-3 shrink-0" /> Open
          </a>
          <AskAiButton context={`Help me get the most out of this resource: "${r.title}" at ${r.url}. What should I focus on for the BOC?`} size="sm" variant="ghost" />
          <Button variant="ghost" size="icon" onClick={() => onDelete(r.id)} className="h-7 w-7 ml-auto" data-testid={`button-delete-resource-${r.id}`}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
