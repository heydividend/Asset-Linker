import { Sidebar } from "./Sidebar";
import { GlobalChat } from "./GlobalChat";
import { useLocation } from "wouter";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  // Strict-mode isolation: hide global chat (and sidebar) while inside a live mock exam.
  const inMockRunner = /^\/mock-exam\/\d+/.test(location);
  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {!inMockRunner && <Sidebar />}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
      {!inMockRunner && <GlobalChat />}
    </div>
  );
}
