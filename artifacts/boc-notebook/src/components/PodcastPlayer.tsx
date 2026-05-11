import { useEffect, useRef, useState } from "react";
import {
  useListStudyGuideAudioOverviews,
  useGenerateStudyGuideAudioOverview,
  useGetAudioOverview,
  getListStudyGuideAudioOverviewsQueryKey,
  getGetAudioOverviewQueryKey,
  type AudioOverview,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Headphones, Loader2, Download, RotateCw } from "lucide-react";

const VOICES = ["nova", "alloy", "echo", "fable", "onyx", "shimmer"] as const;
type Voice = (typeof VOICES)[number];

interface ListenAsPodcastButtonProps {
  studyGuideId: number;
  size?: "default" | "sm";
  variant?: "default" | "outline" | "secondary";
}

export function ListenAsPodcastButton({ studyGuideId, size = "sm", variant = "outline" }: ListenAsPodcastButtonProps) {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState<Voice>("nova");
  const [focus, setFocus] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const generate = useGenerateStudyGuideAudioOverview();

  const onGenerate = () => {
    generate.mutate(
      { id: studyGuideId, data: { voice, focus: focus || undefined } },
      {
        onSuccess: () => {
          setOpen(false);
          setFocus("");
          qc.invalidateQueries({ queryKey: getListStudyGuideAudioOverviewsQueryKey(studyGuideId) });
          toast({ title: "Podcast queued", description: "Two hosts are warming up — ready in a few seconds." });
        },
        onError: (err) => toast({ title: "Couldn't start podcast", description: String(err), variant: "destructive" }),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} data-testid={`button-listen-podcast-${studyGuideId}`}>
          <Headphones className="h-4 w-4 mr-1" /> Listen as podcast
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate two-host podcast</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium">Voice</label>
            <Select value={voice} onValueChange={(v) => setVoice(v as Voice)}>
              <SelectTrigger data-testid="select-podcast-voice"><SelectValue /></SelectTrigger>
              <SelectContent>
                {VOICES.map((v) => (
                  <SelectItem key={v} value={v}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Focus (optional)</label>
            <Input
              placeholder="e.g. emphasize return-to-play criteria"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              data-testid="input-podcast-focus"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onGenerate} disabled={generate.isPending} data-testid="button-confirm-podcast">
            {generate.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PodcastListProps {
  studyGuideId: number;
}

export function PodcastList({ studyGuideId }: PodcastListProps) {
  const { data: audios = [] } = useListStudyGuideAudioOverviews(studyGuideId, {
    query: {
      queryKey: getListStudyGuideAudioOverviewsQueryKey(studyGuideId),
      refetchInterval: (q) => {
        const data = q.state.data as AudioOverview[] | undefined;
        return data?.some((a) => a.status === "pending") ? 4000 : false;
      },
    },
  });

  if (audios.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid={`podcasts-empty-${studyGuideId}`}>
        No podcasts yet. Click "Listen as podcast" to generate one.
      </p>
    );
  }

  return (
    <div className="space-y-2" data-testid={`podcast-list-${studyGuideId}`}>
      {audios.map((a) => (
        <PodcastRow key={a.id} audio={a} studyGuideId={studyGuideId} />
      ))}
    </div>
  );
}

function PodcastRow({ audio, studyGuideId }: { audio: AudioOverview; studyGuideId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const regen = useGenerateStudyGuideAudioOverview();
  const { data: live } = useGetAudioOverview(audio.id, {
    query: {
      queryKey: getGetAudioOverviewQueryKey(audio.id),
      initialData: audio,
      refetchInterval: (q) => {
        const d = q.state.data as AudioOverview | undefined;
        return d && d.status === "pending" ? 4000 : false;
      },
    },
  });
  const status = live?.status ?? audio.status;
  const voice = live?.voice ?? audio.voice;
  const created = live?.createdAt ?? audio.createdAt;

  const lastStatusRef = useRef<string>(status);
  useEffect(() => {
    if (lastStatusRef.current === "pending" && status === "failed") {
      toast({
        title: "Podcast generation failed",
        description: "Something went wrong while making the audio. Try again from the card.",
        variant: "destructive",
      });
    }
    lastStatusRef.current = status;
  }, [status, toast]);

  const onRetry = () => {
    regen.mutate(
      { id: studyGuideId, data: { voice: voice as Voice } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListStudyGuideAudioOverviewsQueryKey(studyGuideId) });
          toast({ title: "Retrying podcast generation" });
        },
      },
    );
  };

  return (
    <Card data-testid={`podcast-card-${audio.id}`}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Headphones className="h-4 w-4 text-primary" />
            <span className="font-medium">{voice}</span>
            <span className="text-xs text-muted-foreground">{new Date(created).toLocaleString()}</span>
          </div>
          <Badge variant={status === "ready" ? "default" : status === "failed" ? "destructive" : "secondary"}>
            {status === "pending" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {status === "pending" ? "Generating audio…" : status}
          </Badge>
        </div>
        {status === "ready" && (
          <div className="flex items-center gap-2">
            <audio
              controls
              src={`/api/audio-overviews/${audio.id}/audio`}
              className="w-full"
              data-testid={`podcast-audio-${audio.id}`}
            />
            <a
              href={`/api/audio-overviews/${audio.id}/audio`}
              download={`podcast-${audio.id}.mp3`}
              className="inline-flex items-center text-xs text-primary hover:underline shrink-0"
              data-testid={`podcast-download-${audio.id}`}
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Download
            </a>
          </div>
        )}
        {status === "failed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={regen.isPending}
            data-testid={`podcast-retry-${audio.id}`}
          >
            <RotateCw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
