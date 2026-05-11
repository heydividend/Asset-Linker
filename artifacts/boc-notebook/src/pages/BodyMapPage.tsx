import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListTopics,
  useStartQuiz,
  useGetDashboardTopicMastery,
  getListQuizAttemptsQueryKey,
  getGetDashboardTopicMasteryQueryKey,
} from "@workspace/api-client-react";
import { bodyRegions, type BodyRegion } from "@/data/bodyRegions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { AskAiButton } from "@/components/AskAiButton";
import {
  AlertTriangle, Activity, Heart, Stethoscope, Eye, EyeOff, RotateCcw, Play, Brain,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import skinImg from "@/assets/anatomy/layer-skin.png";
import muscleImg from "@/assets/anatomy/layer-muscle.png";
import skeletonImg from "@/assets/anatomy/layer-skeleton.png";
import skinBackImg from "@/assets/anatomy/layer-skin-back.png";
import muscleBackImg from "@/assets/anatomy/layer-muscle-back.png";
import skeletonBackImg from "@/assets/anatomy/layer-skeleton-back.png";

// SVG hot-zones were authored in a 200×500 viewBox. Convert to percent of
// the image container so they overlay the anatomical PNGs cleanly.
const VB_W = 200;
const VB_H = 500;
const pct = (n: number, dim: number) => `${(n / dim) * 100}%`;

type LayerKey = "skin" | "muscle" | "skeleton";
const LAYERS: { key: LayerKey; label: string; front: string; back: string }[] = [
  { key: "skin", label: "Surface anatomy", front: skinImg, back: skinBackImg },
  { key: "muscle", label: "Muscular system", front: muscleImg, back: muscleBackImg },
  { key: "skeleton", label: "Skeleton & organs", front: skeletonImg, back: skeletonBackImg },
];

const PRESETS: Record<string, Record<LayerKey, number>> = {
  Skin: { skin: 1, muscle: 0, skeleton: 0 },
  Muscle: { skin: 0.15, muscle: 1, skeleton: 0 },
  Skeleton: { skin: 0.1, muscle: 0, skeleton: 1 },
  "X-ray": { skin: 0.5, muscle: 0.6, skeleton: 0.9 },
};

type ViewKey = "anterior" | "posterior";

export default function BodyMapPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: topics = [], isLoading: topicsLoading } = useListTopics();
  const { data: topicMasteryRows = [] } = useGetDashboardTopicMastery({
    query: { queryKey: getGetDashboardTopicMasteryQueryKey() },
  });
  const startQuiz = useStartQuiz();

  const [view, setView] = useState<ViewKey>("anterior");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<BodyRegion | null>(null);
  const [opacity, setOpacity] = useState<Record<LayerKey, number>>({ skin: 1, muscle: 0, skeleton: 0 });
  const [showHotspots, setShowHotspots] = useState(true);

  const visible = useMemo(() => {
    const wantSide = view === "anterior" ? "front" : "back";
    return bodyRegions.filter((r) => r.side === wantSide || r.side === "both");
  }, [view]);

  // name → id lookup so each region's `topicNames` resolves to seeded topic IDs.
  const topicIdByName = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of topics) m.set(t.name, t.id);
    return m;
  }, [topics]);

  // name → {mastery, attempts, recent} lookup for surfacing per-region mastery + trend.
  const masteryByName = useMemo(() => {
    const m = new Map<
      string,
      {
        mastery: number;
        attempts: number;
        recent: { correct: boolean; answeredAt: string }[];
      }
    >();
    for (const row of topicMasteryRows) {
      m.set(row.name, {
        mastery: row.mastery,
        attempts: row.attempts,
        recent: row.recentAttempts ?? [],
      });
    }
    return m;
  }, [topicMasteryRows]);

  // Aggregate mastery + recent trend across all of a region's seeded topics.
  const regionMastery = useMemo(() => {
    const out = new Map<
      string,
      { pct: number | null; attempts: number; trend: boolean[] }
    >();
    for (const r of bodyRegions) {
      let totalAttempts = 0;
      let totalCorrect = 0;
      const merged: { correct: boolean; answeredAt: string }[] = [];
      for (const name of r.topicNames) {
        const m = masteryByName.get(name);
        if (!m) continue;
        if (m.attempts > 0) {
          totalAttempts += m.attempts;
          totalCorrect += m.mastery * m.attempts;
        }
        for (const a of m.recent) merged.push(a);
      }
      // Most recent 5 across all the region's topics, then chronological for the spark.
      merged.sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
      const trend = merged.slice(0, 5).reverse().map((a) => a.correct);
      out.set(r.id, {
        pct: totalAttempts > 0 ? (totalCorrect / totalAttempts) * 100 : null,
        attempts: totalAttempts,
        trend,
      });
    }
    return out;
  }, [masteryByName]);

  // Direction of the most recent attempts vs. the prior ones in the window.
  const trendDelta = (trend: boolean[]): { dir: "up" | "down" | "flat"; delta: number } => {
    if (trend.length < 2) return { dir: "flat", delta: 0 };
    const half = Math.max(1, Math.floor(trend.length / 2));
    const recent = trend.slice(-half);
    const prior = trend.slice(0, trend.length - half);
    const avg = (a: boolean[]) => (a.length ? a.filter(Boolean).length / a.length : 0);
    const delta = Math.round((avg(recent) - avg(prior)) * 100);
    if (delta > 5) return { dir: "up", delta };
    if (delta < -5) return { dir: "down", delta };
    return { dir: "flat", delta };
  };

  const Sparkline = ({ trend, testId }: { trend: boolean[]; testId?: string }) => {
    if (trend.length === 0) {
      return (
        <span
          className="text-[10px] text-muted-foreground"
          data-testid={testId}
        >
          no attempts
        </span>
      );
    }
    const w = 44;
    const h = 14;
    const step = trend.length > 1 ? w / (trend.length - 1) : 0;
    const pts = trend
      .map((c, i) => `${(i * step).toFixed(1)},${(c ? 2 : h - 2).toFixed(1)}`)
      .join(" ");
    const { dir, delta } = trendDelta(trend);
    const Icon = dir === "up" ? TrendingUp : dir === "down" ? TrendingDown : Minus;
    const iconCls =
      dir === "up"
        ? "text-primary"
        : dir === "down"
          ? "text-destructive"
          : "text-muted-foreground";
    return (
      <span
        className="inline-flex items-center gap-1"
        data-testid={testId}
        title={`Last ${trend.length} attempt${trend.length === 1 ? "" : "s"}: ${trend
          .map((c) => (c ? "✓" : "✗"))
          .join(" ")}${dir !== "flat" ? ` (${delta > 0 ? "+" : ""}${delta}%)` : ""}`}
      >
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          className="overflow-visible"
        >
          <polyline
            points={pts}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {trend.map((c, i) => (
            <circle
              key={i}
              cx={i * step}
              cy={c ? 2 : h - 2}
              r={1.6}
              fill={c ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
            />
          ))}
        </svg>
        <Icon className={`h-3 w-3 ${iconCls}`} />
      </span>
    );
  };

  const masteryTone = (pct: number | null): { label: string; cls: string; hint: string } => {
    if (pct == null) return { label: "—", cls: "border-muted text-muted-foreground", hint: "No attempts yet" };
    const rounded = Math.round(pct);
    if (rounded >= 80) return { label: `${rounded}%`, cls: "border-primary/60 text-primary", hint: "Solid" };
    if (rounded >= 60) return { label: `${rounded}%`, cls: "border-amber-500/60 text-amber-600 dark:text-amber-400", hint: "Getting there" };
    return { label: `${rounded}%`, cls: "border-destructive/60 text-destructive", hint: "Needs work" };
  };

  const setLayer = (k: LayerKey, v: number) => setOpacity((o) => ({ ...o, [k]: v }));
  const applyPreset = (name: keyof typeof PRESETS) => setOpacity(PRESETS[name]);

  const onReviewWeakSpots = (region: BodyRegion) => {
    const ids = region.topicNames
      .map((n) => topicIdByName.get(n))
      .filter((v): v is number => typeof v === "number");
    if (ids.length === 0) {
      toast({
        title: "No focused review available yet",
        description: topicsLoading
          ? "Topics are still loading — try again in a moment."
          : "We don't have flashcard topics linked to this region in the seed bank yet.",
        variant: "destructive",
      });
      return;
    }
    const params = new URLSearchParams();
    params.set("topicIds", ids.join(","));
    params.set("region", region.name);
    setSelected(null);
    navigate(`/flashcards?${params.toString()}`);
  };

  const onQuizRegion = (region: BodyRegion) => {
    const ids = region.topicNames
      .map((n) => topicIdByName.get(n))
      .filter((v): v is number => typeof v === "number");
    if (ids.length === 0) {
      toast({
        title: "No quiz available yet",
        description: "We don't have practice questions linked to this region in the seed bank yet.",
        variant: "destructive",
      });
      return;
    }
    startQuiz.mutate(
      { data: { mode: "region", count: 10, topicIds: ids } },
      {
        onSuccess: (q) => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardTopicMasteryQueryKey() });
          setSelected(null);
          navigate(`/quiz/${q.id}`);
        },
        onError: (e) => {
          toast({
            title: "Couldn't start quiz",
            description: e instanceof Error ? e.message : "Try a different region.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center justify-between px-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-base font-semibold">Clinical Body Map</h1>
          <Tabs value={view} onValueChange={(v) => setView(v as ViewKey)}>
            <TabsList className="h-8">
              <TabsTrigger value="anterior" className="text-xs px-3" data-testid="tab-anterior">Anterior</TabsTrigger>
              <TabsTrigger value="posterior" className="text-xs px-3" data-testid="tab-posterior">Posterior</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex items-center gap-2">
          {(Object.keys(PRESETS) as (keyof typeof PRESETS)[]).map((name) => (
            <Button
              key={name}
              size="sm"
              variant="outline"
              onClick={() => applyPreset(name)}
              data-testid={`preset-${name.toLowerCase()}`}
            >
              {name}
            </Button>
          ))}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowHotspots((v) => !v)}
            data-testid="toggle-hotspots"
            title={showHotspots ? "Hide regions" : "Show regions"}
          >
            {showHotspots ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden grid lg:grid-cols-[260px_1fr_360px]">
        {/* Layer controls */}
        <aside className="border-r bg-sidebar overflow-y-auto p-4 space-y-5">
          <div>
            <p className="text-sm font-semibold mb-1">Anatomical layers</p>
            <p className="text-xs text-muted-foreground">
              Toggle layers and adjust opacity to peel the body from skin to bone.
            </p>
          </div>
          {LAYERS.map((l) => {
            const on = opacity[l.key] > 0;
            return (
              <div key={l.key} className="space-y-2" data-testid={`layer-control-${l.key}`}>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">{l.label}</label>
                  <Switch
                    checked={on}
                    onCheckedChange={(c) => setLayer(l.key, c ? 1 : 0)}
                    data-testid={`switch-${l.key}`}
                  />
                </div>
                <Slider
                  value={[opacity[l.key] * 100]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([v]) => setLayer(l.key, v / 100)}
                  data-testid={`slider-${l.key}`}
                />
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {Math.round(opacity[l.key] * 100)}% opacity
                </p>
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => applyPreset("Skin")}
            data-testid="button-reset-layers"
          >
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        </aside>

        {/* Body viewer */}
        <div className="overflow-auto p-6 flex justify-center bg-muted/20">
          <div className="relative w-full max-w-md aspect-[3/4]" data-testid="body-viewer">
            {LAYERS.map((l) => (
              <img
                key={l.key}
                src={view === "anterior" ? l.front : l.back}
                alt={`${l.label} (${view})`}
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none transition-opacity duration-200"
                style={{ opacity: opacity[l.key] }}
                data-testid={`layer-image-${l.key}-${view}`}
              />
            ))}

            {/* Hot-zone overlay (positioned in % so it tracks any image size) */}
            {showHotspots && visible.map((r) => {
              const isHover = hovered === r.id;
              let left = "50%", top = "50%", width = "8%", height = "5%", borderRadius = "9999px";
              if (r.shape === "ellipse" && r.cx != null && r.cy != null && r.rx != null && r.ry != null) {
                left = pct(r.cx, VB_W);
                top = pct(r.cy, VB_H);
                width = pct(r.rx * 2, VB_W);
                height = pct(r.ry * 2, VB_H);
              } else if (r.shape === "circle" && r.cx != null && r.cy != null && r.r != null) {
                left = pct(r.cx, VB_W);
                top = pct(r.cy, VB_H);
                width = pct(r.r * 2, VB_W);
                height = pct(r.r * 2, VB_H);
              } else if (r.shape === "rect" && r.x != null && r.y != null && r.width != null && r.height != null) {
                left = pct(r.x + r.width / 2, VB_W);
                top = pct(r.y + r.height / 2, VB_H);
                width = pct(r.width, VB_W);
                height = pct(r.height, VB_H);
                borderRadius = "0.4rem";
              }

              const rm = regionMastery.get(r.id) ?? { pct: null, attempts: 0, trend: [] as boolean[] };
              const tone = masteryTone(rm.pct);
              return (
                <HoverCard key={r.id} openDelay={120} closeDelay={50}>
                  <HoverCardTrigger asChild>
                    <button
                      type="button"
                      onMouseEnter={() => setHovered(r.id)}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => setSelected(r)}
                      data-testid={`region-${r.id}`}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all"
                      style={{
                        left,
                        top,
                        width,
                        height,
                        borderRadius,
                        background: isHover
                          ? "hsl(var(--primary) / 0.45)"
                          : "hsl(var(--primary) / 0.18)",
                        border: `2px solid ${isHover ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.6)"}`,
                        boxShadow: isHover ? "0 0 0 4px hsl(var(--primary) / 0.18)" : undefined,
                      }}
                    />
                  </HoverCardTrigger>
                  <HoverCardContent side="right" className="w-72">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{r.name}</p>
                          <Badge variant="outline" className="mt-1 text-[10px]">{r.domain}</Badge>
                        </div>
                        <Stethoscope className="h-4 w-4 text-primary mt-0.5" />
                      </div>
                      <div
                        className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs ${tone.cls}`}
                        data-testid={`hover-mastery-${r.id}`}
                      >
                        <span className="font-medium">Mastery</span>
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums font-semibold">{tone.label}</span>
                          <span className="text-[10px] opacity-80">{tone.hint}</span>
                        </span>
                      </div>
                      <div
                        className="flex items-center justify-between rounded-md border bg-muted/40 px-2 py-1.5 text-xs"
                        data-testid={`hover-trend-${r.id}`}
                      >
                        <span className="font-medium">Recent trend</span>
                        <Sparkline trend={rm.trend} testId={`hover-spark-${r.id}`} />
                      </div>
                      <p className="text-xs text-muted-foreground">{r.blurb}</p>
                      <div className="text-xs space-y-0.5">
                        <p className="font-medium">Common injuries:</p>
                        <ul className="list-disc list-inside text-muted-foreground">
                          {r.injuries.slice(0, 3).map((i) => <li key={i.name}>{i.name}</li>)}
                        </ul>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setSelected(r)}>
                          Open
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          onClick={() => onQuizRegion(r)}
                          disabled={startQuiz.isPending || topicsLoading}
                          data-testid={`hover-drill-${r.id}`}
                        >
                          <Play className="h-3 w-3 mr-1" /> Drill
                        </Button>
                      </div>
                      {rm.pct != null && rm.pct < 60 && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full border-destructive/50 text-destructive hover:text-destructive"
                          onClick={() => onReviewWeakSpots(r)}
                          disabled={topicsLoading}
                          data-testid={`hover-review-weak-${r.id}`}
                          title="Jump into a focused flashcard review for this region"
                        >
                          <Brain className="h-3 w-3 mr-1" /> Review weak spots
                        </Button>
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            })}
          </div>
        </div>

        {/* Region list */}
        <aside className="border-l bg-sidebar overflow-hidden flex flex-col">
          <div className="h-12 border-b flex items-center px-4">
            <span className="text-sm font-semibold">
              {view === "anterior" ? "Anterior" : "Posterior"} regions ({visible.length})
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {visible.map((r) => {
                const rm = regionMastery.get(r.id) ?? { pct: null, attempts: 0, trend: [] as boolean[] };
                const tone = masteryTone(rm.pct);
                const isWeak = rm.pct != null && rm.pct < 60;
                return (
                  <div
                    key={r.id}
                    onMouseEnter={() => setHovered(r.id)}
                    onMouseLeave={() => setHovered(null)}
                    className={`rounded-md ${hovered === r.id ? "bg-sidebar-accent" : ""}`}
                  >
                    <button
                      onClick={() => setSelected(r)}
                      className="w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-2 hover-elevate"
                      data-testid={`region-list-${r.id}`}
                      title={rm.attempts > 0 ? `${rm.attempts} attempt${rm.attempts === 1 ? "" : "s"} on this region — ${tone.hint.toLowerCase()}` : "No attempts yet"}
                    >
                      <span className="truncate">{r.name}</span>
                      <span className="flex items-center gap-2 shrink-0">
                        <Sparkline trend={rm.trend} testId={`region-trend-${r.id}`} />
                        <Badge
                          variant="outline"
                          className={`text-[10px] tabular-nums ${tone.cls}`}
                          data-testid={`region-mastery-${r.id}`}
                        >
                          {tone.label}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">{r.injuries.length}</Badge>
                      </span>
                    </button>
                    {isWeak && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onReviewWeakSpots(r); }}
                        disabled={topicsLoading}
                        className="w-full mt-0.5 mb-1 px-3 py-1 text-[11px] rounded-md flex items-center gap-1 text-destructive border border-destructive/30 bg-destructive/5 hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
                        data-testid={`region-list-review-${r.id}`}
                        title="Jump into a focused flashcard review for this region"
                      >
                        <Brain className="h-3 w-3" /> Review weak spots
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </aside>
      </div>

      {/* Detail sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <SheetTitle data-testid="text-region-title">{selected.name}</SheetTitle>
                    <SheetDescription>{selected.blurb}</SheetDescription>
                    <Badge variant="secondary" className="mt-2">{selected.domain}</Badge>
                  </div>
                  <AskAiButton
                    context={`I'm reviewing ${selected.name} for the BOC exam. Quiz me on 5 high-yield clinical scenarios for this region — include red flags, special tests, and return-to-play criteria.`}
                    label="Ask AI to quiz me"
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => onQuizRegion(selected)}
                    disabled={startQuiz.isPending || topicsLoading}
                    data-testid="button-quiz-region"
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5" />
                    {startQuiz.isPending
                      ? "Starting…"
                      : topicsLoading
                        ? "Loading topics…"
                        : "Quiz this region"}
                  </Button>
                  {(() => {
                    const rm = regionMastery.get(selected.id) ?? { pct: null, attempts: 0 };
                    if (rm.pct == null || rm.pct >= 60) return null;
                    return (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/50 text-destructive hover:text-destructive"
                        onClick={() => onReviewWeakSpots(selected)}
                        disabled={topicsLoading}
                        data-testid="button-review-weak-region"
                        title="Jump into a focused flashcard review for this region"
                      >
                        <Brain className="h-3.5 w-3.5 mr-1.5" /> Review weak spots
                      </Button>
                    );
                  })()}
                </div>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {selected.injuries.map((inj) => (
                  <Card key={inj.name} data-testid={`card-injury-${inj.name.replace(/\s+/g, "-").toLowerCase()}`}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold">{inj.name}</h3>
                        <AskAiButton
                          context={`Tell me everything I need to know about ${inj.name} for the BOC exam: pathomechanics, special tests with sensitivity/specificity, evidence-based treatment, and RTP criteria. Include 2 sample exam-style questions with rationales.`}
                          size="sm"
                          variant="outline"
                          label="Ask AI"
                        />
                      </div>

                      {inj.redFlags && inj.redFlags.length > 0 && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                          <p className="text-xs font-semibold text-destructive flex items-center gap-1 mb-1">
                            <AlertTriangle className="h-3 w-3" /> Red flags — refer immediately
                          </p>
                          <ul className="text-xs text-destructive/90 list-disc list-inside space-y-0.5">
                            {inj.redFlags.map((f) => <li key={f}>{f}</li>)}
                          </ul>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold mb-1 flex items-center gap-1">
                          <Stethoscope className="h-3 w-3 text-primary" /> Evaluation
                        </p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                          {inj.evaluation.map((e) => (
                            <li key={e} className="group flex items-start gap-1">
                              <span className="flex-1">{e}</span>
                              <AskAiButton
                                context={`Explain this BOC concept in depth with a clinical example: "${e}" (related to ${inj.name}, ${selected.name}).`}
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                              />
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <p className="text-xs font-semibold mb-1 flex items-center gap-1">
                          <Heart className="h-3 w-3 text-primary" /> Treatment
                        </p>
                        <ul className="text-sm text-muted-foreground list-disc list-inside space-y-0.5">
                          {inj.treatment.map((t) => (
                            <li key={t} className="group flex items-start gap-1">
                              <span className="flex-1">{t}</span>
                              <AskAiButton
                                context={`Walk me through the evidence base for this BOC treatment: "${t}" (for ${inj.name}). What are the rehab milestones and progression criteria?`}
                                size="icon"
                                variant="ghost"
                                className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                              />
                            </li>
                          ))}
                        </ul>
                      </div>

                      {inj.rtp && (
                        <div className="rounded-md border bg-secondary/30 p-3">
                          <p className="text-xs font-semibold mb-1">Return-to-play</p>
                          <p className="text-sm">{inj.rtp}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {selected.highYield.length > 0 && (
                  <Card className="border-primary/30 bg-primary/5">
                    <CardContent className="p-4 space-y-2">
                      <p className="text-sm font-semibold flex items-center gap-1">
                        <Activity className="h-4 w-4 text-primary" /> BOC high-yield
                      </p>
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        {selected.highYield.map((h) => (
                          <li key={h} className="group flex items-start gap-1">
                            <span className="flex-1">{h}</span>
                            <AskAiButton
                              context={`Drill me deeper on this BOC high-yield fact: "${h}" (related to ${selected.name}). Give me 3 exam-style questions with rationales.`}
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                            />
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
