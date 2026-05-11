import { Link, useLocation } from "wouter";
import { BookText, Brain, LayoutDashboard, Library, Stethoscope, Settings, Menu, Bot, ClipboardList, PenTool, Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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

  return (
    <div className="w-64 border-r bg-sidebar h-screen sticky top-0 flex flex-col hidden md:flex">
      <div className="h-14 flex items-center px-4 border-b border-sidebar-border">
        <Stethoscope className="h-6 w-6 text-primary mr-2" />
        <span className="font-semibold text-sidebar-foreground">BOC Notebook</span>
      </div>
      
      <div className="flex-1 py-4 flex flex-col gap-1 px-2 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href}>
              <Button
                variant={isActive ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-left font-medium",
                  isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
                data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="h-4 w-4 mr-2" />
                {item.label}
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
