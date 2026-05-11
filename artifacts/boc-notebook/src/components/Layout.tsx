import { Sidebar } from "./Sidebar";
import { ChatPanel } from "./ChatPanel";
import { Button } from "@/components/ui/button";
import { Bot } from "lucide-react";
import { useLocation } from "wouter";
import { useChatStore } from "@/hooks/use-chat";

// Routes that own their full width (no docked chat panel).
function shouldHideChat(location: string): boolean {
  if (/^\/mock-exam\/\d+/.test(location)) return true; // strict timed exam
  if (/^\/notebooks\/\d+/.test(location)) return true; // 3-panel notebook view
  if (location === "/tutor") return true; // dedicated tutor page
  return false;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const inMockRunner = /^\/mock-exam\/\d+/.test(location);
  const hideChat = shouldHideChat(location);
  const { isPanelCollapsed, setPanelCollapsed } = useChatStore();

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {!inMockRunner && <Sidebar />}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
      {!hideChat && !isPanelCollapsed && <ChatPanel />}
      {!hideChat && isPanelCollapsed && (
        <div className="hidden lg:flex fixed bottom-6 right-6 z-40">
          <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            onClick={() => setPanelCollapsed(false)}
            data-testid="button-show-chat"
            title="Show AI tutor"
          >
            <Bot className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
