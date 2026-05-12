import { Link, useParams } from "wouter";
import {
  useGetStudyGuide,
  getGetStudyGuideQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, BookOpen } from "lucide-react";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { formatDateTime } from "@/lib/formatDate";
import { ListenAsPodcastButton, PodcastList } from "@/components/PodcastPlayer";

export default function StudyGuideDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { data: guide, isLoading } = useGetStudyGuide(id, {
    query: { enabled: !!id, queryKey: getGetStudyGuideQueryKey(id) },
  });

  if (isLoading) return <div className="p-6">Loading study guide…</div>;
  if (!guide) return <div className="p-6">Study guide not found.</div>;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="border-b px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/study-guides">
            <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back-guides">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="font-semibold truncate" data-testid="text-guide-title">{guide.title}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <Badge variant="outline">{guide.format}</Badge>
              <Link href={`/notebooks/${guide.notebookId}`}>
                <span className="inline-flex items-center gap-1 hover:underline cursor-pointer truncate">
                  <BookOpen className="h-3 w-3" />
                  {guide.notebookTitle}
                </span>
              </Link>
              <span>· {formatDateTime(guide.createdAt)}</span>
            </div>
          </div>
        </div>
        <ListenAsPodcastButton studyGuideId={guide.id} variant="default" size="default" />
      </header>

      <div className="flex-1 grid lg:grid-cols-[1fr_360px] gap-6 p-6 max-w-6xl mx-auto w-full">
        <article className="max-w-none" data-testid="text-guide-content">
          <MarkdownMessage content={guide.content} />
        </article>
        <aside className="space-y-3">
          <Card>
            <CardContent className="p-4 space-y-3">
              <h2 className="font-semibold text-sm">Podcast versions</h2>
              <PodcastList studyGuideId={guide.id} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
