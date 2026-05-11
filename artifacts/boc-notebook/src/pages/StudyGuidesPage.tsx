import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListAllStudyGuides,
  useListNotebooks,
  useGenerateStudyGuide,
  getListAllStudyGuidesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, FileText, Loader2, Sparkles } from "lucide-react";
import { ListenAsPodcastButton, PodcastList } from "@/components/PodcastPlayer";
import { useToast } from "@/hooks/use-toast";

const FORMAT_OPTIONS = [
  { value: "all", label: "All formats" },
  { value: "outline", label: "Outline" },
  { value: "summary", label: "Summary" },
  { value: "qa", label: "Q&A" },
  { value: "mindmap", label: "Mind Map" },
] as const;

type Format = "outline" | "summary" | "qa" | "mindmap";

export default function StudyGuidesPage() {
  const [notebookFilter, setNotebookFilter] = useState<string>("all");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const { data: notebooks = [] } = useListNotebooks();
  const params = useMemo(() => {
    const p: { notebookId?: number; format?: Format } = {};
    if (notebookFilter !== "all") p.notebookId = Number(notebookFilter);
    if (formatFilter !== "all") p.format = formatFilter as Format;
    return p;
  }, [notebookFilter, formatFilter]);
  const { data: guides = [], isLoading } = useListAllStudyGuides(params);

  // Generation
  const { toast } = useToast();
  const qc = useQueryClient();
  const genGuide = useGenerateStudyGuide();
  const [genOpen, setGenOpen] = useState(false);
  const [genNotebookId, setGenNotebookId] = useState<string>("");
  const [genFormat, setGenFormat] = useState<Format>("outline");
  const [genFocus, setGenFocus] = useState("");

  // Default the generation notebook to the first available once notebooks load.
  if (!genNotebookId && notebooks.length > 0) {
    setGenNotebookId(String(notebooks[0].id));
  }

  const onGenerate = () => {
    const nbId = Number(genNotebookId);
    if (!Number.isFinite(nbId) || nbId <= 0) {
      toast({ title: "Pick a notebook", variant: "destructive" });
      return;
    }
    genGuide.mutate(
      { id: nbId, data: { format: genFormat, focus: genFocus || undefined } },
      {
        onSuccess: () => {
          setGenOpen(false);
          setGenFocus("");
          // Refetch the listing so the new guide appears immediately.
          qc.invalidateQueries({ queryKey: getListAllStudyGuidesQueryKey() });
          toast({ title: "Study guide generated" });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Generation failed";
          toast({ title: "Couldn't generate guide", description: msg, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Study Guides</h1>
          <p className="text-sm text-muted-foreground">
            Every guide across your notebooks. Listen to any one as a two-host podcast.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <Select value={notebookFilter} onValueChange={setNotebookFilter}>
            <SelectTrigger className="w-48" data-testid="filter-notebook"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All notebooks</SelectItem>
              {notebooks.map((nb) => (
                <SelectItem key={nb.id} value={String(nb.id)}>{nb.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={formatFilter} onValueChange={setFormatFilter}>
            <SelectTrigger className="w-40" data-testid="filter-format"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={genOpen} onOpenChange={setGenOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-generate-guide-page" disabled={notebooks.length === 0}>
                <Sparkles className="h-4 w-4 mr-1" /> Generate study guide
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Generate a study guide</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Source notebook</label>
                  <Select value={genNotebookId} onValueChange={setGenNotebookId}>
                    <SelectTrigger data-testid="select-gen-notebook"><SelectValue placeholder="Pick a notebook" /></SelectTrigger>
                    <SelectContent>
                      {notebooks.map((nb) => (
                        <SelectItem key={nb.id} value={String(nb.id)}>{nb.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Format</label>
                  <Select value={genFormat} onValueChange={(v) => setGenFormat(v as Format)}>
                    <SelectTrigger data-testid="select-gen-format"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outline">Outline</SelectItem>
                      <SelectItem value="summary">Summary</SelectItem>
                      <SelectItem value="qa">Q&amp;A</SelectItem>
                      <SelectItem value="mindmap">Mind Map</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  placeholder="Focus (optional, e.g. heat illness, concussion)"
                  value={genFocus}
                  onChange={(e) => setGenFocus(e.target.value)}
                  data-testid="input-gen-focus"
                />
                <Button
                  onClick={onGenerate}
                  disabled={genGuide.isPending || !genNotebookId}
                  data-testid="button-confirm-gen-guide"
                  className="w-full"
                >
                  {genGuide.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  Generate
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : guides.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No study guides yet. Click <span className="font-medium">Generate study guide</span> above to create one from any of your notebooks (including the BOC Official Practice Q&amp;A set).
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {guides.map((g) => (
            <Card key={g.id} className="hover-elevate" data-testid={`guide-row-${g.id}`}>
              <CardContent className="p-4 space-y-2">
                <Link href={`/study-guides/${g.id}`}>
                  <div className="flex items-start gap-2 cursor-pointer">
                    <FileText className="h-4 w-4 text-primary mt-1 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <h2 className="font-semibold text-sm truncate" title={g.title}>{g.title}</h2>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{g.format}</Badge>
                        <span className="inline-flex items-center gap-1 truncate">
                          <BookOpen className="h-3 w-3 shrink-0" />
                          <span className="truncate">{g.notebookTitle}</span>
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {new Date(g.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </Link>
                <div className="border-t pt-2 space-y-2">
                  <PodcastList studyGuideId={g.id} />
                </div>
                <div className="flex justify-end">
                  <ListenAsPodcastButton studyGuideId={g.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
