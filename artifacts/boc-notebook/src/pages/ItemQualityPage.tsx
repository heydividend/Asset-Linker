import { useGetItemAnalysis } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// Friendly label + tone for each item-analysis flag (from the BOC/Castle
// item-analysis lens: difficulty, discrimination, distractor function).
const FLAG_META: Record<string, { label: string; tone: string }> = {
  "negative-discrimination": { label: "Likely miskeyed", tone: "bg-destructive/15 text-destructive" },
  "low-discrimination": { label: "Low discrimination", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  "too-hard": { label: "Too hard", tone: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  "too-easy": { label: "Too easy", tone: "bg-muted text-muted-foreground" },
  "non-functional-distractor": { label: "Dead distractor", tone: "bg-muted text-muted-foreground" },
  "insufficient-data": { label: "Not enough data", tone: "bg-muted text-muted-foreground" },
};

const flagLabel = (f: string) => FLAG_META[f]?.label ?? f;
const flagTone = (f: string) => FLAG_META[f]?.tone ?? "bg-muted text-muted-foreground";

export default function ItemQualityPage() {
  const { data, isLoading, isError } = useGetItemAnalysis({ minN: 5, limit: 100 });

  if (isLoading) {
    return (
      <div className="container max-w-5xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-16" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container max-w-5xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">Couldn't load item analysis.</CardContent>
        </Card>
      </div>
    );
  }

  const flagEntries = Object.entries(data.flagCounts ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="container max-w-5xl mx-auto p-6 space-y-4" data-testid="item-quality-page">
      <div>
        <h1 className="text-2xl font-bold">Item Quality</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Classical item analysis over your answer history — difficulty (p-value), discrimination
          (point-biserial), and distractor function. Items most worth reviewing are listed first.
        </p>
      </div>

      {data.totalAnswers === 0 || (data.items?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground" data-testid="item-quality-empty">
            {data.note ?? "No items have enough responses yet. Answer more quiz questions, then check back."}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {data.analyzed} items analyzed from {data.totalAnswers} answers
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {flagEntries.length === 0 ? (
                <span className="text-sm text-muted-foreground">No quality issues flagged. 🎉</span>
              ) : (
                flagEntries.map(([flag, count]) => (
                  <Badge key={flag} variant="outline" className={`${flagTone(flag)} border-none`}>
                    {flagLabel(flag)}: {count}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-2">
            {data.items.map((item) => (
              <Card key={item.questionId} data-testid={`item-${item.questionId}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium min-w-0">{item.stem}</p>
                    {item.domain && (
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {item.domain}
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span title="Responses analyzed">n={item.n}</span>
                    <span title="Difficulty: fraction answered correctly">
                      difficulty {Math.round(item.pValue * 100)}%
                    </span>
                    <span
                      title="Discrimination (point-biserial): negative means stronger students miss it more"
                      className={item.discrimination < 0 ? "text-destructive font-medium" : ""}
                    >
                      discrimination {item.discrimination.toFixed(2)}
                    </span>
                    {item.nonFunctionalDistractors.length > 0 && (
                      <span title="Distractor choice indices almost no one picked">
                        dead distractor{item.nonFunctionalDistractors.length > 1 ? "s" : ""} #
                        {item.nonFunctionalDistractors.join(", #")}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {item.flags.map((f) => (
                      <span key={f} className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${flagTone(f)}`}>
                        {flagLabel(f)}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
