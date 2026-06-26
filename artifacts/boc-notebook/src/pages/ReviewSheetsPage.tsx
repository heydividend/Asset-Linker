import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollText, Clock, ChevronRight } from "lucide-react";

interface ReviewSheetSummary {
  code: string;
  title: string;
  summary: string;
  estMinutes: number;
}

export default function ReviewSheetsPage() {
  const { data, isLoading } = useQuery<{ sheets: ReviewSheetSummary[] }>({
    queryKey: ["review-sheets"],
    queryFn: () => fetch("/api/review-sheets").then((r) => r.json()),
  });

  const sheets = data?.sheets ?? [];

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center px-4">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <ScrollText className="h-4 w-4" /> Review Sheets
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-3xl mx-auto w-full">
        <p className="text-sm text-muted-foreground">
          Concise, high-yield cram sheets for each BOC Practice Analysis (PA8) domain — the
          essentials to skim before a quiz or on exam week.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading review sheets…</p>
        ) : (
          <div className="space-y-3">
            {sheets.map((s) => (
              <Link key={s.code} href={`/review-sheets/${s.code}`}>
                <Card className="hover-elevate cursor-pointer" data-testid={`review-sheet-${s.code}`}>
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{s.code}</Badge>
                        <h2 className="font-medium text-sm truncate">{s.title}</h2>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{s.summary}</p>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1.5">
                        <Clock className="h-3 w-3" /> ~{s.estMinutes} min read
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
