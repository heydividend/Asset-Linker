import { Link, useParams, useLocation } from "wouter";
import {
  useGetStudyGuide,
  useDeleteStudyGuide,
  getGetStudyGuideQueryKey,
  getListAllStudyGuidesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, BookOpen, Trash2 } from "lucide-react";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { formatDateTime } from "@/lib/formatDate";
import { ListenAsPodcastButton, PodcastList } from "@/components/PodcastPlayer";
import { useToast } from "@/hooks/use-toast";

export default function StudyGuideDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { data: guide, isLoading } = useGetStudyGuide(id, {
    query: { enabled: !!id, queryKey: getGetStudyGuideQueryKey(id) },
  });
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const delGuide = useDeleteStudyGuide();

  const onDelete = () => {
    if (!guide) return;
    const title = guide.title;
    delGuide.mutate(
      { id: guide.id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListAllStudyGuidesQueryKey() });
          toast({ title: "Study guide deleted", description: title });
          navigate("/study-guides");
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Delete failed";
          toast({ title: "Couldn't delete guide", description: msg, variant: "destructive" });
        },
      },
    );
  };

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
        <div className="flex items-center gap-2">
          <ListenAsPodcastButton studyGuideId={guide.id} variant="default" size="default" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                title="Delete study guide"
                data-testid="button-delete-guide"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this study guide?</AlertDialogTitle>
                <AlertDialogDescription>
                  "{guide.title}" and any podcast versions generated from it will be removed. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete-guide">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete-guide"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
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
