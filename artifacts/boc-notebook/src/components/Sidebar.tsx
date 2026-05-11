import { Link, useLocation } from "wouter";
import { BookText, Brain, LayoutDashboard, Library, Stethoscope, Bot, ClipboardList, PenTool, Activity, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ResizeHandle } from "./ResizeHandle";
import { useLayoutStore } from "@/hooks/use-layout";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/notebooks", label: "Notebooks", icon: BookText },
  { href: "/flashcards", label: "Flashcards", icon: Brain },
  { href: "/quiz", label: "Practice Quizzes", icon: ClipboardList },
  { href: "/mock-exam", label: "Mock Exam", icon: Stethoscope },
  { href: "/body-map", label: "Body Map", icon: Activity },
  { href: "/resources", label: "Resources", icon: Library },
  { href: "/scraper", label: "Import Content", icon: PenTool },
  { href: "/tutor", label: "AI Tutor", icon: Bot },
  { href: "/schedule", label: "Schedule", icon: BookText },
];

export function Sidebar() {
  const [location] = useLocation();
  const { sidebarWidth, setSidebarWidth, toggleSidebar } = useLayoutStore();

  return (
    <div
      className="relative border-r bg-sidebar h-screen sticky top-0 hidden md:flex flex-col shrink-0"
      style={{ width: sidebarWidth }}
    >
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border gap-2 min-w-0">
        <Stethoscope className="h-6 w-6 text-primary shrink-0" />
        <span className="font-semibold text-sidebar-foreground truncate flex-1">BOC Notebook</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={toggleSidebar}
          data-testid="button-collapse-sidebar"
          title="Collapse sidebar"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-left font-medium min-w-0",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <item.icon className="h-4 w-4 mr-2 shrink-0" />
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
