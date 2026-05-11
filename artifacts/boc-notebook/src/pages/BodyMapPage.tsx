import { useState } from "react";
import { bodyRegions, type BodyRegion } from "@/data/bodyRegions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AskAiButton } from "@/components/AskAiButton";
import { AlertTriangle, Activity, Heart, Stethoscope } from "lucide-react";

export default function BodyMapPage() {
  const [view, setView] = useState<"front" | "back">("front");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<BodyRegion | null>(null);

  const visible = bodyRegions.filter((r) => r.side === view || r.side === "both");

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Clinical Body Map</h1>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as "front" | "back")}>
          <TabsList>
            <TabsTrigger value="front" data-testid="tab-body-front">Anterior</TabsTrigger>
            <TabsTrigger value="back" data-testid="tab-body-back">Posterior</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="flex-1 overflow-hidden grid lg:grid-cols-[1fr_360px]">
        <div className="overflow-auto p-6 flex justify-center bg-muted/20">
          <div className="relative w-full max-w-md">
            <p className="text-center text-xs text-muted-foreground mb-2">
              Hover for a quick clinical snapshot · click to open full breakdown with Ask AI
            </p>
            <svg viewBox="0 0 200 500" className="w-full h-auto" data-testid="svg-body-map">
              {/* Stylized human silhouette */}
              <g fill="hsl(var(--muted))" stroke="hsl(var(--border))" strokeWidth="0.6">
                {/* Head */}
                <ellipse cx="100" cy="42" rx="28" ry="32" />
                {/* Neck */}
                <rect x="88" y="68" width="24" height="20" />
                {/* Torso */}
                <path d="M55 95 Q60 85 80 88 L120 88 Q140 85 145 95 L138 200 Q132 230 125 240 L75 240 Q68 230 62 200 Z" />
                {/* Pelvis */}
                <path d="M68 235 L132 235 L130 270 Q120 280 100 280 Q80 280 70 270 Z" />
                {/* Left arm */}
                <path d="M55 95 Q40 130 42 175 Q35 210 28 240 L40 245 Q48 215 52 180 Q60 140 65 105 Z" />
                {/* Right arm */}
                <path d="M145 95 Q160 130 158 175 Q165 210 172 240 L160 245 Q152 215 148 180 Q140 140 135 105 Z" />
                {/* Left leg */}
                <path d="M70 270 L72 360 Q72 405 78 440 L76 470 L92 470 L92 440 Q96 400 96 360 L96 270 Z" />
                {/* Right leg */}
                <path d="M104 270 L104 360 Q104 400 108 440 L108 470 L124 470 L122 440 Q128 405 128 360 L130 270 Z" />
                {/* Feet */}
                <ellipse cx="84" cy="478" rx="14" ry="6" />
                <ellipse cx="116" cy="478" rx="14" ry="6" />
              </g>

              {/* Hot zones */}
              {visible.map((r) => {
                const isHover = hovered === r.id;
                const fill = isHover ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.15)";
                const stroke = "hsl(var(--primary))";
                const common = {
                  fill,
                  stroke,
                  strokeWidth: isHover ? 1.5 : 0.8,
                  className: "cursor-pointer transition-all",
                  onMouseEnter: () => setHovered(r.id),
                  onMouseLeave: () => setHovered(null),
                  onClick: () => setSelected(r),
                  "data-testid": `region-${r.id}`,
                };
                const hotspot =
                  r.shape === "ellipse" ? (
                    <ellipse key={r.id} cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} {...common} />
                  ) : r.shape === "circle" ? (
                    <circle key={r.id} cx={r.cx} cy={r.cy} r={r.r} {...common} />
                  ) : (
                    <rect key={r.id} x={r.x} y={r.y} width={r.width} height={r.height} rx={4} {...common} />
                  );

                return (
                  <HoverCard key={r.id} openDelay={120} closeDelay={50}>
                    <HoverCardTrigger asChild>{hotspot}</HoverCardTrigger>
                    <HoverCardContent side="right" className="w-72">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-sm">{r.name}</p>
                            <Badge variant="outline" className="mt-1 text-[10px]">{r.domain}</Badge>
                          </div>
                          <Stethoscope className="h-4 w-4 text-primary mt-0.5" />
                        </div>
                        <p className="text-xs text-muted-foreground">{r.blurb}</p>
                        <div className="text-xs space-y-0.5">
                          <p className="font-medium">Common injuries:</p>
                          <ul className="list-disc list-inside text-muted-foreground">
                            {r.injuries.slice(0, 3).map((i) => <li key={i.name}>{i.name}</li>)}
                          </ul>
                        </div>
                        <Button size="sm" variant="outline" className="w-full" onClick={() => setSelected(r)}>
                          Open full breakdown
                        </Button>
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </svg>
          </div>
        </div>

        <aside className="border-l bg-sidebar overflow-hidden flex flex-col">
          <div className="h-12 border-b flex items-center px-4">
            <span className="text-sm font-semibold">Regions ({visible.length})</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {visible.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  onMouseEnter={() => setHovered(r.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between hover-elevate ${hovered === r.id ? "bg-sidebar-accent" : ""}`}
                  data-testid={`region-list-${r.id}`}
                >
                  <span>{r.name}</span>
                  <Badge variant="outline" className="text-[10px]">{r.injuries.length}</Badge>
                </button>
              ))}
            </div>
          </ScrollArea>
        </aside>
      </div>

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
