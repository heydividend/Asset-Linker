import { useState, useEffect, useRef } from "react";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useDeleteOpenaiConversation,
  useListOpenaiMessages,
  getListOpenaiConversationsQueryKey,
  getListOpenaiMessagesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Plus, Send, Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TutorPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: convs = [] } = useListOpenaiConversations({ query: { queryKey: getListOpenaiConversationsQueryKey() } });
  const create = useCreateOpenaiConversation();
  const del = useDeleteOpenaiConversation();
  const [activeId, setActiveId] = useState<number | null>(null);
  const { data: messages = [] } = useListOpenaiMessages(activeId!, {
    query: { enabled: !!activeId, queryKey: getListOpenaiMessagesQueryKey(activeId!) },
  });
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeId && convs[0]) setActiveId(convs[0].id);
  }, [convs, activeId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, streaming]);

  const newConv = () => {
    create.mutate(
      { data: { title: "New Conversation" } },
      {
        onSuccess: (c) => {
          setActiveId(c.id);
          qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        },
      },
    );
  };

  const removeConv = (id: number) => {
    if (!confirm("Delete this conversation?")) return;
    del.mutate({ id }, {
      onSuccess: () => {
        if (activeId === id) setActiveId(null);
        qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      },
    });
  };

  const send = async () => {
    if (!activeId || !input.trim()) return;
    const text = input;
    setInput("");
    setStreaming("");
    setBusy(true);
    try {
      const res = await fetch(`/api/openai/conversations/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6));
            if (json.done) {
              qc.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(activeId) });
              setStreaming("");
              setBusy(false);
              return;
            }
            if (json.error) {
              toast({ title: "AI error", description: json.error, variant: "destructive" });
              setBusy(false);
              return;
            }
            if (json.content) setStreaming((p) => p + json.content);
          } catch { /* ignore */ }
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full">
      <aside className="w-64 border-r bg-sidebar flex flex-col">
        <div className="p-3 border-b">
          <Button className="w-full" size="sm" onClick={newConv} data-testid="button-new-conversation">
            <Plus className="h-4 w-4 mr-2" /> New chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {convs.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-1 group ${c.id === activeId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"} rounded-md`}
              >
                <button
                  className="flex-1 text-left px-2 py-2 text-sm truncate"
                  onClick={() => setActiveId(c.id)}
                  data-testid={`conv-${c.id}`}
                >
                  {c.title || `Conversation ${c.id}`}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 group-hover:opacity-100"
                  onClick={() => removeConv(c.id)}
                  data-testid={`button-delete-conv-${c.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="h-14 border-b flex items-center px-6">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI Tutor
          </h1>
        </header>
        <ScrollArea className="flex-1 p-6" ref={scrollRef}>
          <div className="max-w-3xl mx-auto space-y-4">
            {!activeId && <p className="text-muted-foreground text-center py-8">Pick or start a conversation.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-4 py-2 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg px-4 py-2 bg-muted">
                  <p className="text-sm whitespace-pre-wrap break-words">{streaming}</p>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="border-t p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="flex gap-2 max-w-3xl mx-auto"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your tutor…"
              disabled={!activeId || busy}
              data-testid="input-tutor-message"
            />
            <Button type="submit" size="icon" disabled={!activeId || busy || !input.trim()} data-testid="button-tutor-send">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
