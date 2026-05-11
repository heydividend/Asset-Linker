import { useState } from "react";
import { bodyRegions, type BodyRegion } from "@/data/bodyRegions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { AskAiButton } from "@/components/AskAiButton";
import { AlertTriangle, Activity, Heart, Stethoscope, Eye, EyeOff, RotateCcw } from "lucide-react";
import skinImg from "@/assets/anatomy/layer-skin.png";
import muscleImg from "@/assets/anatomy/layer-muscle.png";
import skeletonImg from "@/assets/anatomy/layer-skeleton.png";

// SVG hot-zones were authored in a 200×500 viewBox. Convert to percent of
// the image container so they overlay the anatomical PNGs cleanly.
const VB_W = 200;
const VB_H = 500;
const pct = (n: number, dim: number) => `${(n / dim) * 100}%`;

type LayerKey = "skin" | "muscle" | "skeleton";
const LAYERS: { key: LayerKey; label: string; src: string }[] = [
  { key: "skin", label: "Surface anatomy", src: skinImg },
  { key: "muscle", label: "Muscular system", src: muscleImg },
  { key: "skeleton", label: "Skeleton & organs", src: skeletonImg },
];

const PRESETS: Record<string, Record<LayerKey, number>> = {
  Skin: { skin: 1, muscle: 0, skeleton: 0 },
  Muscle: { skin: 0.15, muscle: 1, skeleton: 0 },
  Skeleton: { skin: 0.1, muscle: 0, skeleton: 1 },
  "X-ray": { skin: 0.5, muscle: 0.6, skeleton: 0.9 },
};

export default function BodyMapPage() {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<BodyRegion | null>(null);
  const [opacity, setOpacity] = useState<Record<LayerKey, number>>({ skin: 1, muscle: 0, skeleton: 0 });
  const [showHotspots, setShowHotspots] = useState(true);

  // Only "front" + "both" regions overlay these anterior images.
  const visible = bodyRegions.filter((r) => r.side === "front" || r.side === "both");

  const setLayer = (k: LayerKey, v: number) => setOpacity((o) => ({ ...o, [k]: v }));
  const applyPreset = (name: keyof typeof PRESETS) => setOpacity(PRESETS[name]);

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center justify-between px-6 gap-4">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Clinical Body Map</h1>
          <Badge variant="outline" className="ml-2 text-xs">Anterior view</Badge>
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
            {/* Stacked anatomical images */}
            {LAYERS.map((l) => (
              <img
                key={l.key}
                src={l.src}
                alt={l.label}
                draggable={false}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none transition-opacity duration-200"
                style={{ opacity: opacity[l.key] }}
              />
            ))}

            {/* Hot-zone overlay (positioned in % so it tracks any image size) */}
            {showHotspots && visible.map((r) => {
              const isHover = hovered === r.id;
              // Compute bounding-box style from the original SVG primitive
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
          </div>
        </div>

        {/* Region list */}
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

      {/* Detail sheet (unchanged) */}
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
