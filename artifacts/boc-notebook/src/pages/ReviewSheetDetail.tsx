import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Clock } from "lucide-react";
import { MarkdownMessage } from "@/components/MarkdownMessage";

interface ReviewSheetDetailData {
  code: string;
  title: string;
  summary: string;
  estMinutes: number;
  markdown: string;
  domainName: string | null;
}

export default function ReviewSheetDetail() {
  const params = useParams();
  const code = String(params.code ?? "");
  const { data, isLoading, isError } = useQuery<ReviewSheetDetailData>({
    queryKey: ["review-sheet", code],
    queryFn: async () => {
      const res = await fetch(`/api/review-sheets/${code}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
    enabled: !!code,
  });

  if (isLoading) return <div className="p-6">Loading review sheet…</div>;
  if (isError || !data) return <div className="p-6">Review sheet not found.</div>;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <header className="border-b px-6 py-4 flex items-center gap-3">
        <Link href="/review-sheets">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back-review-sheets">
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="font-semibold truncate" data-testid="text-review-sheet-title">{data.title}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            <Badge variant="outline">{data.code}</Badge>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> ~{data.estMinutes} min read
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
        <article className="max-w-none" data-testid="text-review-sheet-content">
          <MarkdownMessage content={data.markdown} />
        </article>
      </div>
    </div>
  );
}
