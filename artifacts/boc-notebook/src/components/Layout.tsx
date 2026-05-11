import { Sidebar } from "./Sidebar";
import { GlobalChat } from "./GlobalChat";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
      <GlobalChat />
    </div>
  );
}
