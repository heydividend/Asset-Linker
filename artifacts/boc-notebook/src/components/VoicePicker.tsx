import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Mic2, Play } from "lucide-react";
import { useSpeech, type TtsVoice } from "@/hooks/use-speech";

const VOICES: { id: TtsVoice; label: string; description: string }[] = [
  { id: "nova", label: "Nova", description: "Warm, energetic female" },
  { id: "shimmer", label: "Shimmer", description: "Bright, friendly female" },
  { id: "alloy", label: "Alloy", description: "Neutral, balanced" },
  { id: "fable", label: "Fable", description: "British, expressive" },
  { id: "echo", label: "Echo", description: "Calm male" },
  { id: "onyx", label: "Onyx", description: "Deep, authoritative male" },
];

const PREVIEW_TEXT =
  "Hi! This is a quick preview of how I sound when reading your study notes.";

export function VoicePicker() {
  const { voice, setVoice, speak } = useSpeech();
  const current = VOICES.find((v) => v.id === voice) ?? VOICES[0];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-left font-medium min-w-0 h-8 px-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/50"
          title="Choose the voice used for read-aloud"
          data-testid="button-voice-picker"
        >
          <Mic2 className="h-3.5 w-3.5 mr-2 shrink-0" />
          <span className="truncate">Voice: {current.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-64 p-1.5">
        <p className="px-2 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          Read-aloud voice
        </p>
        <div className="space-y-0.5">
          {VOICES.map((v) => {
            const active = v.id === voice;
            return (
              <div
                key={v.id}
                className={
                  "flex items-center gap-1 rounded px-1 " +
                  (active ? "bg-accent/60" : "hover:bg-accent/40")
                }
              >
                <button
                  type="button"
                  onClick={() => setVoice(v.id)}
                  className="flex-1 text-left py-1.5 px-1 text-[13px]"
                  data-testid={`voice-option-${v.id}`}
                >
                  <div className="font-medium">{v.label}</div>
                  <div className="text-[11px] text-muted-foreground">{v.description}</div>
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title={`Preview ${v.label}`}
                  onClick={() => {
                    setVoice(v.id);
                    void speak(`voice-preview-${v.id}`, PREVIEW_TEXT);
                  }}
                  data-testid={`voice-preview-${v.id}`}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
        <p className="px-2 pt-1 pb-1 text-[11px] text-muted-foreground">
          Powered by high-quality AI voices.
        </p>
      </PopoverContent>
    </Popover>
  );
}
