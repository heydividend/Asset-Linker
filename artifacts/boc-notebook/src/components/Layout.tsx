import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { ChatPanel } from "./ChatPanel";
import { Button } from "@/components/ui/button";
import { Bot, Menu, Compass, MapPin, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { useLayoutStore } from "@/hooks/use-layout";
import { useTour } from "./TourProvider";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  const { startTour } = useTour();
  const [tourFabOpen, setTourFabOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {!inMockRunner && !sidebarCollapsed && <Sidebar />}
      <main className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto">{children}</div>
      </main>
      {!hideChat && !chatCollapsed && <ChatPanel />}

      {/* Floating restore buttons */}
      {!inMockRunner && sidebarCollapsed && (
        <div className="hidden md:flex fixed bottom-6 left-6 z-40 flex-col gap-2 items-start">
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
          <Popover open={tourFabOpen} onOpenChange={setTourFabOpen}>
            <PopoverTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="h-10 w-10 rounded-full shadow-lg"
                data-testid="button-take-tour-fab"
                data-tour="sidebar-take-tour-fab"
                title="Take a guided tour"
              >
                <Compass className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="right" align="end" className="w-60 p-1.5">
              <div className="space-y-0.5">
                <p className="px-2 pt-1.5 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                  Guided tour
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-[13px]"
                  onClick={() => {
                    setTourFabOpen(false);
                    startTour("page");
                  }}
                  data-testid="menu-tour-this-page-fab"
                >
                  <MapPin className="h-3.5 w-3.5 mr-2 shrink-0" />
                  Tour this page
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-[13px]"
                  onClick={() => {
                    setTourFabOpen(false);
                    startTour("all");
                  }}
                  data-testid="menu-tour-whole-app-fab"
                >
                  <FileText className="h-3.5 w-3.5 mr-2 shrink-0" />
                  Tour the whole app
                </Button>
                <p className="px-2 pt-1 pb-1 text-[11px] text-muted-foreground">
                  Press <kbd className="rounded border bg-muted px-1 text-[10px]">Esc</kbd> to exit anytime.
                </p>
              </div>
            </PopoverContent>
          </Popover>
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
