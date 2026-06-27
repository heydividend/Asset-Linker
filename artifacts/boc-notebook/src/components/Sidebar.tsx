import { Link, useLocation } from "wouter";
import { useClerk } from "@clerk/react";
import { Stethoscope, ChevronLeft, Compass, MapPin, FileText, RotateCcw, HelpCircle, Check, PlayCircle, LogOut } from "lucide-react";
import { PAGES } from "@/lib/tour";
import { HelpDialog } from "./HelpDialog";
import { VoicePicker } from "./VoicePicker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ResizeHandle } from "./ResizeHandle";
import { useLayoutStore } from "@/hooks/use-layout";
import { useTour } from "./TourProvider";
import { useState } from "react";
import { NAV_ITEMS as navItems } from "@/lib/nav";

export function Sidebar() {
  const [location] = useLocation();
  const { sidebarWidth, setSidebarWidth, toggleSidebar } = useLayoutStore();
  const { startTour, replayWelcomeTour, progress } = useTour();
  const { signOut } = useClerk();
  const sidebarBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [tourMenuOpen, setTourMenuOpen] = useState(false);
  const completedSet = new Set(progress.completed);
  const progressLabel = `${progress.completed.length}/${progress.total}`;
  const hasStarted = progress.completed.length > 0;
  const allDone = progress.done && progress.total > 0;

  return (
    <div
      className="relative border-r bg-sidebar h-screen sticky top-0 hidden md:flex flex-col shrink-0"
      style={{ width: sidebarWidth }}
    >
      <div className="h-12 flex items-center px-3 border-b border-sidebar-border gap-1.5 min-w-0">
        <Stethoscope className="h-5 w-5 text-primary shrink-0" />
        <span className="font-semibold text-sm text-sidebar-foreground truncate flex-1">BOC Notebook</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 shrink-0"
          onClick={toggleSidebar}
          data-testid="button-collapse-sidebar"
          title="Collapse sidebar"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 py-2 flex flex-col gap-0.5 px-1.5 overflow-y-auto" data-tour="sidebar-nav">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "w-full justify-start text-left font-medium min-w-0 h-8 px-2 text-[13px]",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
                title={item.label}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <item.icon className="h-3.5 w-3.5 mr-2 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Button>
            </Link>
          );
        })}
      </div>

      <div className="border-t border-sidebar-border px-1.5 py-2 space-y-0.5">
        <VoicePicker />
        <HelpDialog
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-left font-medium min-w-0 h-8 px-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/50"
              title="How to use this app"
              data-testid="button-help"
            >
              <HelpCircle className="h-3.5 w-3.5 mr-2 shrink-0" />
              <span className="truncate">Help</span>
            </Button>
          }
        />
        <Popover open={tourMenuOpen} onOpenChange={setTourMenuOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-left font-medium min-w-0 h-8 px-2 text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/50"
              title={
                allDone
                  ? "All tours completed — replay any time"
                  : `Take a guided tour (${progressLabel} done)`
              }
              data-tour="sidebar-take-tour"
              data-testid="button-take-tour"
            >
              <Compass className="h-3.5 w-3.5 mr-2 shrink-0" />
              <span className="truncate flex-1">Take a Tour</span>
              <span
                className={cn(
                  "ml-1 shrink-0 rounded-full px-1.5 py-0 text-[10px] font-semibold tabular-nums",
                  allDone
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : hasStarted
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground",
                )}
                data-testid="tour-progress-badge"
              >
                {allDone ? <Check className="h-3 w-3" /> : progressLabel}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="right" align="end" className="w-72 p-1.5">
            <div className="space-y-0.5">
              <div className="px-2 pt-1.5 pb-1 flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Guided tour
                </p>
                <span
                  className="text-[11px] tabular-nums text-muted-foreground"
                  data-testid="tour-progress-text"
                >
                  {progressLabel} pages
                </span>
              </div>
              {progress.total > 0 && (
                <div className="mx-2 mb-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      allDone ? "bg-emerald-500" : "bg-primary",
                    )}
                    style={{
                      width: `${(progress.completed.length / progress.total) * 100}%`,
                    }}
                  />
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-[13px]"
                onClick={() => {
                  setTourMenuOpen(false);
                  startTour("page");
                }}
                data-testid="menu-tour-this-page"
              >
                <MapPin className="h-3.5 w-3.5 mr-2 shrink-0" />
                Tour this page
              </Button>
              {!allDone && hasStarted && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-[13px]"
                  onClick={() => {
                    setTourMenuOpen(false);
                    startTour("remaining");
                  }}
                  data-testid="menu-tour-continue"
                  title="Walk through every tour you haven't finished yet"
                >
                  <PlayCircle className="h-3.5 w-3.5 mr-2 shrink-0" />
                  Continue tour ({progress.remaining.length} left)
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-[13px]"
                onClick={() => {
                  setTourMenuOpen(false);
                  startTour("all");
                }}
                data-testid="menu-tour-whole-app"
              >
                <FileText className="h-3.5 w-3.5 mr-2 shrink-0" />
                Tour the whole app
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-[13px]"
                onClick={() => {
                  setTourMenuOpen(false);
                  replayWelcomeTour();
                }}
                data-testid="menu-tour-replay-welcome"
                title="Reset progress and replay every tour from the start"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-2 shrink-0" />
                Reset & replay
              </Button>
              {progress.total > 0 && (
                <div className="mt-1 max-h-48 overflow-y-auto rounded-md border bg-muted/30 px-1 py-1">
                  {[...progress.completed, ...progress.remaining].map((key) => {
                    const isDone = completedSet.has(key);
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 px-2 py-1 text-[12px]"
                        data-testid={`tour-item-${key}`}
                      >
                        {isDone ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <span className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40 shrink-0" />
                        )}
                        <span
                          className={cn(
                            "truncate",
                            isDone ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {PAGES[key].label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="px-2 pt-1 pb-1 text-[11px] text-muted-foreground">
                Press <kbd className="rounded border bg-muted px-1 text-[10px]">Esc</kbd> to exit anytime.
              </p>
            </div>
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-[13px] text-sidebar-foreground hover:bg-sidebar-accent/50"
          onClick={() => signOut({ redirectUrl: sidebarBasePath || "/" })}
          data-testid="button-log-out"
          title="Log out"
        >
          <LogOut className="h-3.5 w-3.5 mr-2 shrink-0" />
          Log out
        </Button>
      </div>

      <ResizeHandle
        side="left"
        getStartWidth={() => sidebarWidth}
        onResize={setSidebarWidth}
        testId="resize-handle-sidebar"
      />
    </div>
  );
}
