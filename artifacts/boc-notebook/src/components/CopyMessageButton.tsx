import { useState } from "react";
import { Check, ChevronDown, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { markdownToPlainText } from "@/lib/markdown-to-text";
import { cn } from "@/lib/utils";

interface CopyMessageButtonProps {
  content: string;
  className?: string;
  testId?: string;
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyMessageButton({ content, className, testId }: CopyMessageButtonProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = async (mode: "text" | "markdown") => {
    const payload = mode === "markdown" ? content : markdownToPlainText(content);
    const ok = await writeClipboard(payload);
    if (!ok) {
      toast({
        title: "Couldn't copy",
        description: "Your browser blocked the clipboard.",
        variant: "destructive",
      });
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    toast({
      title: mode === "markdown" ? "Copied as markdown" : "Copied as text",
    });
  };

  return (
    <div className={cn("inline-flex items-center", className)}>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => handleCopy("text")}
        className="h-6 px-1.5 gap-1 text-muted-foreground hover:text-foreground"
        title="Copy as text"
        data-testid={testId ?? "button-copy-message"}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        <span className="text-[11px]">Copy</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-5 text-muted-foreground hover:text-foreground"
            title="Copy options"
            data-testid={`${testId ?? "button-copy-message"}-options`}
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[10rem]">
          <DropdownMenuItem onClick={() => handleCopy("text")} data-testid="copy-as-text">
            Copy as text
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleCopy("markdown")} data-testid="copy-as-markdown">
            Copy as markdown
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
