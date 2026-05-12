import { Button } from "@/components/ui/button";
import { Volume2, Square, Loader2 } from "lucide-react";
import { useSpeech } from "@/hooks/use-speech";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface SpeakButtonProps {
  /** Stable id so multiple buttons coordinate which one is currently playing. */
  id: string;
  /** Plain or markdown text to read aloud. Markdown will be stripped. */
  text: string;
  /** Tooltip when idle. */
  label?: string;
  size?: "sm" | "icon" | "default";
  variant?: "ghost" | "outline" | "secondary";
  className?: string;
  testId?: string;
}

export function SpeakButton({
  id,
  text,
  label = "Read aloud",
  size = "icon",
  variant = "ghost",
  className,
  testId,
}: SpeakButtonProps) {
  const { supported, speak, stop, isSpeaking, isLoading } = useSpeech();
  const { toast } = useToast();
  const active = isSpeaking(id);
  const loading = isLoading(id);

  if (!supported) return null;

  return (
    <Button
      type="button"
      size={size}
      variant={active || loading ? "secondary" : variant}
      disabled={loading}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        if (active || loading) stop();
        else
          speak(id, text).catch((err) => {
            toast({
              title: "Read-aloud failed",
              description: err instanceof Error ? err.message : "Could not play audio",
              variant: "destructive",
            });
          });
      }}
      className={cn(
        size === "icon" && "h-7 w-7",
        (active || loading) && "text-primary",
        className,
      )}
      title={active ? "Stop reading" : loading ? "Loading voice…" : label}
      aria-label={active ? "Stop reading" : loading ? "Loading voice" : label}
      aria-pressed={active}
      data-testid={testId ?? "button-speak"}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : active ? (
        <Square className="h-3.5 w-3.5" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}
