import { useState, useEffect, useRef } from "react";
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useDeleteOpenaiConversation,
  useListOpenaiMessages,
  getListOpenaiConversationsQueryKey,
  getListOpenaiMessagesQueryKey,
  getListNotebooksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Plus, Send, Trash2, Loader2, Paperclip, Eraser } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MarkdownMessage } from "@/components/MarkdownMessage";

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
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    del.mutate({ id }, {
      onSuccess: () => {
        if (activeId === id) setActiveId(null);
        // Synchronously drop the deleted conv from the cache so the
        // auto-select effect doesn't immediately re-pick it before the
        // server refetch returns.
        qc.setQueryData<typeof convs>(
          getListOpenaiConversationsQueryKey(),
          (prev) => (prev ?? []).filter((c) => c.id !== id),
        );
        qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        toast({ title: "Conversation deleted" });
      },
      onError: (e) => {
        toast({
          title: "Couldn't delete conversation",
          description: e instanceof Error ? e.message : "Try again.",
          variant: "destructive",
        });
      },
    });
  };

  const clearAll = async () => {
    if (convs.length === 0) return;
    if (!confirm(`Delete ALL ${convs.length} conversation${convs.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    try {
      await Promise.all(
        convs.map((c) =>
          fetch(`/api/openai/conversations/${c.id}`, { method: "DELETE" }),
        ),
      );
      setActiveId(null);
      // Synchronously empty the cache so the auto-select effect (which
      // runs on the next render with stale convs) doesn't re-pick a
      // just-deleted conversation.
      qc.setQueryData(getListOpenaiConversationsQueryKey(), []);
      qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      toast({ title: "All conversations deleted" });
    } catch (e) {
      toast({
        title: "Couldn't clear conversations",
        description: e instanceof Error ? e.message : "Try again.",
        variant: "destructive",
      });
    }
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
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch { /* ignore */ }
        toast({ title: "AI request failed", description: msg, variant: "destructive" });
        if (res.status === 404) {
          // The conversation we held in state no longer exists on the server
          // (e.g. cleared from another tab). Reset and refresh the list so the
          // user can pick or start a new chat instead of being stuck.
          setActiveId(null);
          qc.setQueryData<typeof convs>(
            getListOpenaiConversationsQueryKey(),
            (prev) => (prev ?? []).filter((c) => c.id !== activeId),
          );
          qc.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        }
        return;
      }
      if (!res.body) {
        toast({ title: "AI returned no response", variant: "destructive" });
        return;
      }
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
    } catch (e) {
      toast({
        title: "Couldn't reach the tutor",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      setStreaming("");
    }
  };

  const onPickFile = () => {
    if (!activeId || uploading || busy) return;
    fileRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeId) return;
    if (file.size > 40 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 40 MB.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("saveToLibrary", "true");
      const res = await fetch(`/api/openai/conversations/${activeId}/upload`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: "Upload failed",
          description: (json as { error?: string }).error ?? `HTTP ${res.status}`,
          variant: "destructive",
        });
        return;
      }
      qc.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(activeId) });
      const j = json as { extractedChars?: number; savedNoteId?: number | null };
      if (j.savedNoteId) {
        qc.invalidateQueries({ queryKey: getListNotebooksQueryKey() });
      }
      toast({
        title: "File attached",
        description: `${file.name} — ${j.extractedChars ?? 0} chars extracted. Ask a question about it below.`,
      });
    } catch (err) {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Network error.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full">
      <aside className="w-64 border-r bg-sidebar flex flex-col">
        <div className="p-3 border-b space-y-2">
          <Button className="w-full" size="sm" onClick={newConv} data-testid="button-new-conversation">
            <Plus className="h-4 w-4 mr-2" /> New chat
          </Button>
          {convs.length > 0 && (
            <Button
              className="w-full"
              size="sm"
              variant="outline"
              onClick={clearAll}
              data-testid="button-clear-all-conversations"
              title="Delete every conversation"
            >
              <Eraser className="h-4 w-4 mr-2" /> Clear all chats
            </Button>
          )}
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
                  className="h-7 w-7 mr-1 text-muted-foreground hover:text-destructive"
                  onClick={() => removeConv(c.id)}
                  title="Delete this conversation"
                  data-testid={`button-delete-conv-${c.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="h-12 border-b flex items-center justify-between px-4">
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" /> AI Tutor
          </h1>
          {activeId != null && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeConv(activeId)}
              data-testid="button-delete-active-conv"
              title="Delete this conversation"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" /> Delete chat
            </Button>
          )}
        </header>
        <ScrollArea className="flex-1 p-6" ref={scrollRef}>
          <div className="max-w-3xl mx-auto space-y-4">
            {!activeId && <p className="text-muted-foreground text-center py-8">Pick or start a conversation.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] min-w-0 rounded-lg px-4 py-2 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {m.role === "user" ? (
                    <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                  ) : (
                    <MarkdownMessage content={m.content} className="text-sm" />
                  )}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[80%] min-w-0 rounded-lg px-4 py-2 bg-muted">
                  <MarkdownMessage content={streaming} className="text-sm" />
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
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={onFileChosen}
              data-testid="input-tutor-file"
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={onPickFile}
              disabled={!activeId || busy || uploading}
              title="Attach a PDF, text file, or image"
              data-testid="button-tutor-attach"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </Button>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={uploading ? "Uploading file…" : "Ask your tutor…"}
              disabled={!activeId || busy || uploading}
              data-testid="input-tutor-message"
            />
            <Button type="submit" size="icon" disabled={!activeId || busy || uploading || !input.trim()} data-testid="button-tutor-send">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
