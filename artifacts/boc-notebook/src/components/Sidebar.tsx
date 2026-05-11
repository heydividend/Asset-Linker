import { Link, useLocation } from "wouter";
import { BookText, Brain, LayoutDashboard, Stethoscope, Bot, ClipboardList, Activity, ChevronLeft, CalendarDays, Gamepad2, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResizeHandle } from "./ResizeHandle";
import { useLayoutStore } from "@/hooks/use-layout";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/notebooks", label: "Notebooks", icon: BookText },
  { href: "/study-guides", label: "Study Guides", icon: Headphones },
  { href: "/flashcards", label: "Flashcards", icon: Brain },
  { href: "/quiz", label: "Practice Quizzes", icon: ClipboardList },
  { href: "/mock-exam", label: "Mock Exam", icon: Stethoscope },
  { href: "/body-map", label: "Body Map", icon: Activity },
  { href: "/games", label: "Games", icon: Gamepad2 },
  { href: "/tutor", label: "AI Tutor", icon: Bot },
];

export function Sidebar() {
  const [location] = useLocation();
  const { sidebarWidth, setSidebarWidth, toggleSidebar } = useLayoutStore();

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

      <div className="flex-1 py-2 flex flex-col gap-0.5 px-1.5 overflow-y-auto">
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

      <ResizeHandle
        side="left"
        getStartWidth={() => sidebarWidth}
        onResize={setSidebarWidth}
        testId="resize-handle-sidebar"
      />
    </div>
  );
}
