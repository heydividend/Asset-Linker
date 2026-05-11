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
}

export function AskAiButton({ context, notebookId, label = "Ask AI", variant = "secondary", size = "sm", className }: AskAiButtonProps) {
  const openChat = useChatStore(s => s.openChat);

  return (
    <Button 
      variant={variant} 
      size={size} 
      className={className}
      onClick={() => openChat({ initialContext: context, notebookId })}
      data-testid="button-ask-ai"
    >
      <Bot className="h-4 w-4 mr-2" />
      {label}
    </Button>
  );
}
