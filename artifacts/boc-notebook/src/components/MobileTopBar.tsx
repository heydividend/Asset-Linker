import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Menu, Stethoscope, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function MobileTopBar() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <header
      className="md:hidden sticky top-0 z-30 h-12 flex items-center gap-2 px-2 border-b bg-background/95 backdrop-blur"
      data-testid="mobile-top-bar"
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="h-9 w-9"
            data-testid="button-mobile-menu"
            title="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[80vw] max-w-xs p-0 flex flex-col">
          <SheetHeader className="h-12 flex flex-row items-center justify-between px-3 border-b space-y-0">
            <SheetTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Stethoscope className="h-4 w-4 text-primary" />
              BOC Notebook
            </SheetTitle>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() => setOpen(false)}
              data-testid="button-mobile-menu-close"
              title="Close menu"
            >
              <X className="h-4 w-4" />
            </Button>
          </SheetHeader>
          <ScrollArea className="flex-1">
            <nav className="flex flex-col gap-0.5 p-2" data-testid="mobile-nav">
              {NAV_ITEMS.map((item) => {
                const isActive =
                  location === item.href ||
                  (item.href !== "/" && location.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href}>
                    <Button
                      variant={isActive ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setOpen(false)}
                      className={cn(
                        "w-full justify-start text-left font-medium h-10 px-3 text-sm",
                        isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                      data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      <item.icon className="h-4 w-4 mr-3 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <Stethoscope className="h-4 w-4 text-primary shrink-0" />
        <span className="font-semibold text-sm truncate">BOC Notebook</span>
      </div>
    </header>
  );
}
