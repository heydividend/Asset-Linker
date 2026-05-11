import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { useChatStore } from "@/hooks/use-chat";

interface AskAiButtonProps {
  context: string;
  notebookId?: number;
  label?: string;
  variant?: "default" | "secondary" | "outline" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  /**
   * Called right after openChat. Use this to dismiss any modal/sheet
   * that would otherwise cover the chat panel (e.g. the Body Map
   * region sheet) so the user can actually see the AI response.
   */
  onAsked?: () => void;
}

export function AskAiButton({ context, notebookId, label = "Ask AI", variant = "secondary", size = "sm", className, onAsked }: AskAiButtonProps) {
  const openChat = useChatStore(s => s.openChat);

  const isIcon = size === "icon";
  return (
    <Button 
      variant={variant} 
      size={size} 
      className={className}
      onClick={() => {
        openChat({ initialContext: context, notebookId });
        onAsked?.();
      }}
      title={isIcon ? label : undefined}
      data-testid="button-ask-ai"
    >
      <Bot className={isIcon ? "h-3.5 w-3.5" : "h-4 w-4 mr-2"} />
      {!isIcon && label}
    </Button>
  );
}
