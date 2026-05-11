import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListAllStudyGuides,
  useListNotebooks,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, FileText } from "lucide-react";
import { ListenAsPodcastButton, PodcastList } from "@/components/PodcastPlayer";

const FORMAT_OPTIONS = [
  { value: "all", label: "All formats" },
  { value: "outline", label: "Outline" },
  { value: "summary", label: "Summary" },
  { value: "qa", label: "Q&A" },
  { value: "mindmap", label: "Mind Map" },
] as const;

export default function StudyGuidesPage() {
  const [notebookFilter, setNotebookFilter] = useState<string>("all");
  const [formatFilter, setFormatFilter] = useState<string>("all");
  const { data: notebooks = [] } = useListNotebooks();
  const params = useMemo(() => {
    const p: { notebookId?: number; format?: "outline" | "summary" | "qa" | "mindmap" } = {};
    if (notebookFilter !== "all") p.notebookId = Number(notebookFilter);
    if (formatFilter !== "all") p.format = formatFilter as "outline" | "summary" | "qa" | "mindmap";
    return p;
  }, [notebookFilter, formatFilter]);
  const { data: guides = [], isLoading } = useListAllStudyGuides(params);

  return (
    <div className="flex flex-col h-full p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">Study Guides</h1>
          <p className="text-sm text-muted-foreground">
            Every guide across your notebooks. Listen to any one as a two-host podcast.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : guides.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No study guides yet. Open a notebook and generate one — it will show up here.
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
