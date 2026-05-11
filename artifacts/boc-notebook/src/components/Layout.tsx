import { Sidebar } from "./Sidebar";
import { ChatPanel } from "./ChatPanel";
import { Button } from "@/components/ui/button";
import { Bot, Menu } from "lucide-react";
import { useLocation } from "wouter";
import { useLayoutStore } from "@/hooks/use-layout";

// Routes that own their full width (no docked chat panel).
// - /tutor is itself the full-page Ask-AI surface (docked panel would be redundant).
// - /mock-exam/:id is the strict timed exam runner (no AI assistance allowed).
// All other routes — including /notebooks/:id — get the docked Ask-AI panel.
function shouldHideChat(location: string): boolean {
  if (/^\/mock-exam\/\d+/.test(location)) return true;
  if (location === "/tutor") return true;
  return false;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const inMockRunner = /^\/mock-exam\/\d+/.test(location);
  const hideChat = shouldHideChat(location);
  const { sidebarCollapsed, setSidebarCollapsed, chatCollapsed, setChatCollapsed } = useLayoutStore();

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {!inMockRunner && !sidebarCollapsed && <Sidebar />}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
      {!hideChat && !chatCollapsed && <ChatPanel />}

      {/* Floating restore buttons */}
      {!inMockRunner && sidebarCollapsed && (
        <div className="hidden md:flex fixed bottom-6 left-6 z-40">
          <Button
            size="icon"
            variant="secondary"
            className="h-10 w-10 rounded-full shadow-lg"
            onClick={() => setSidebarCollapsed(false)}
            data-testid="button-show-sidebar"
            title="Show sidebar"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      )}
      {!hideChat && chatCollapsed && (
        <div className="flex fixed bottom-6 right-6 z-40">
          <Button
            size="icon"
            className="h-12 w-12 rounded-full shadow-lg"
            onClick={() => setChatCollapsed(false)}
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
