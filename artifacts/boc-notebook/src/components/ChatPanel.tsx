import { useChatStore } from "@/hooks/use-chat";
import { useLayoutStore } from "@/hooks/use-layout";
import { ResizeHandle } from "./ResizeHandle";
import { Button } from "@/components/ui/button";
import { Bot, Send, Paperclip, X, Loader2, BookmarkPlus, Plus, ChevronRight, ArrowDown } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import {
  useListOpenaiMessages,
  useCreateOpenaiConversation,
  getListOpenaiMessagesQueryKey,
  getListOpenaiConversationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { MarkdownMessage } from "./MarkdownMessage";
import { CopyMessageButton } from "./CopyMessageButton";
import { useTypewriter } from "@/hooks/use-typewriter";

function FollowupChips({ items, onPick }: { items: string[]; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5 max-w-[88%] min-w-0" data-testid="followup-chips">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-1">
        Follow-ups
      </span>
      {items.map((q, i) => (
        <button
          key={i}
          onClick={() => onPick(q)}
          className="text-left text-xs px-2.5 py-1.5 rounded-md border border-dashed border-primary/40 text-primary hover-elevate bg-background"
          data-testid={`followup-chip-${i}`}
        >
          {q}
        </button>
      ))}
    </div>
  );
}

export function ChatPanel() {
  const { conversationId, notebookId, initialContext, newChatNonce, startNewChat } = useChatStore();
  const { chatWidth, setChatWidth, setChatCollapsed } = useLayoutStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [streamDone, setStreamDone] = useState<boolean>(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [pendingFollowups, setPendingFollowups] = useState<string[]>([]);
  const displayedStream = useTypewriter(streamingMessage, streamDone);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saveForStudy, setSaveForStudy] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  // Radix <ScrollArea> renders an internal viewport that is the actual
  // scrollable element; the outer ref points to the root wrapper. Resolve the
  // viewport once so scroll reads/writes hit the right node.
  const getViewport = useCallback((): HTMLElement | null => {
    const root = scrollRef.current;
    if (!root) return null;
    return root.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
  }, []);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const { data: messages = [] } = useListOpenaiMessages(activeConvId!, {
    query: { enabled: !!activeConvId, queryKey: getListOpenaiMessagesQueryKey(activeConvId!) },
  });

  const createConv = useCreateOpenaiConversation();

  const sendMessage = useCallback(
    async (text: string, convId: number) => {
      if (!convId) return;
      const trimmed = text.trim();

      if (pendingFile) {
        const fd = new FormData();
        fd.append("file", pendingFile);
        fd.append("saveToLibrary", String(saveForStudy));
        setUploading(true);
        try {
          const res = await fetch(`/api/openai/conversations/${convId}/upload`, { method: "POST", body: fd });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            toast({ title: "Upload failed", description: err.error ?? "Unknown error", variant: "destructive" });
            return;
          }
          const data = await res.json();
          toast({
            title: `Attached ${data.filename}`,
            description: data.savedNoteId ? "Saved to your library." : "Available for this chat.",
          });
          queryClient.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(convId) });
          setPendingFile(null);
          if (fileRef.current) fileRef.current.value = "";
        } finally {
          setUploading(false);
        }
      }
      if (!trimmed) {
        queryClient.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(convId) });
        return;
      }

      setInput("");
      setStreamingMessage("");
      setStreamDone(false);
      setPendingUserMessage(trimmed);
      setPendingFollowups([]);
      setStreaming(true);

      try {
        const res = await fetch(`/api/openai/conversations/${convId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: trimmed }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          toast({ title: "AI error", description: err.error ?? `HTTP ${res.status}`, variant: "destructive" });
          setStreaming(false);
          return;
        }
        if (!res.body) {
          toast({ title: "AI error", description: "No response stream", variant: "destructive" });
          setStreaming(false);
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
                // Visible answer is complete — flush the typewriter to the
                // full buffer and release the UI immediately, even though
                // follow-up suggestions may still be on the way. The
                // refetch will swap the streaming bubble for the persisted
                // assistant message and clear the optimistic user echo.
                setStreamDone(true);
                queryClient.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(convId) });
                queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
                setStreaming(false);
                continue;
              }
              if (json.error) {
                toast({ title: "AI error", description: json.error, variant: "destructive" });
                setStreaming(false);
                return;
              }
              if (Array.isArray(json.followups)) {
                setPendingFollowups(json.followups.filter((s: unknown) => typeof s === "string"));
                // The server persists followups onto the just-saved
                // message after `done`. Refetch so the chips render
                // tied to the message instead of as a transient block.
                queryClient.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(convId) });
              }
              if (json.content) setStreamingMessage((p) => p + json.content);
            } catch {
              // ignore
            }
          }
        }
      } catch (error) {
        toast({ title: "Network error", description: String(error), variant: "destructive" });
      } finally {
        setStreaming(false);
      }
    },
    [pendingFile, saveForStudy, queryClient, toast],
  );

  // Once the assistant message has been persisted and refetched, drop the
  // optimistic user echo and clear the streaming buffer so we render the
  // canonical messages list (with copy button + followups) instead of two
  // bubbles at once.
  useEffect(() => {
    if (!pendingUserMessage) return;
    const last = messages[messages.length - 1];
    const prev = messages[messages.length - 2];
    const userEchoed =
      (last?.role === "user" && last.content === pendingUserMessage) ||
      (last?.role === "assistant" && prev?.role === "user" && prev.content === pendingUserMessage);
    if (userEchoed) {
      setPendingUserMessage(null);
      if (last?.role === "assistant") {
        setStreamingMessage("");
        setStreamDone(false);
      }
    }
  }, [messages, pendingUserMessage]);

  // Sync activeConvId with store: explicit conversationId selects that one;
  // otherwise (newChatNonce changed or first mount), create a fresh one.
  useEffect(() => {
    if (conversationId) {
      setActiveConvId(conversationId);
      setStreamingMessage("");
      return;
    }
    setActiveConvId(null);
    setStreamingMessage("");
    createConv.mutate(
      {
        data: {
          title: initialContext ? initialContext.slice(0, 60) : "New Conversation",
          notebookId: notebookId ?? undefined,
        },
      },
      {
        onSuccess: (data) => {
          setActiveConvId(data.id);
          queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
          if (initialContext) sendMessage(initialContext, data.id);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, newChatNonce]);

  // If a context was injected for an existing conversation, send it once.
  useEffect(() => {
    if (conversationId && activeConvId === conversationId && initialContext) {
      sendMessage(initialContext, activeConvId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, activeConvId]);

  // Track whether the user is pinned to the bottom. If they scroll up to
  // re-read context, we stop auto-scrolling and surface a "scroll to latest"
  // pill instead.
  useEffect(() => {
    const vp = getViewport();
    if (!vp) return;
    const onScroll = () => {
      const distance = vp.scrollHeight - vp.scrollTop - vp.clientHeight;
      setAtBottom(distance < 60);
    };
    vp.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => vp.removeEventListener("scroll", onScroll);
  }, [getViewport, activeConvId]);

  // Auto-scroll only when user is already at the bottom — never yank them
  // away from older content they're reading.
  useEffect(() => {
    if (!atBottom) return;
    const vp = getViewport();
    if (vp) vp.scrollTop = vp.scrollHeight;
  }, [messages, displayedStream, pendingUserMessage, atBottom, getViewport]);

  const scrollToLatest = useCallback(() => {
    const vp = getViewport();
    if (!vp) return;
    vp.scrollTo({ top: vp.scrollHeight, behavior: "smooth" });
    setAtBottom(true);
  }, [getViewport]);

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f);
  };

  return (
    <>
      <div
        className="lg:hidden fixed inset-0 bg-black/40 z-40"
        onClick={() => setChatCollapsed(true)}
        data-testid="chat-backdrop"
      />
    <aside
      className="flex flex-col border-l bg-background h-screen shrink-0 fixed lg:sticky right-0 top-0 z-50 lg:z-auto shadow-2xl lg:shadow-none max-lg:!w-[min(420px,95vw)]"
      style={{ width: chatWidth }}
    >
      <ResizeHandle
        side="right"
        getStartWidth={() => chatWidth}
        onResize={setChatWidth}
        testId="resize-handle-chat"
      />
      <header className="h-14 border-b flex items-center justify-between px-3 gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Bot className="h-5 w-5 text-primary shrink-0" />
          <span className="font-semibold truncate">AI Tutor</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => startNewChat({ notebookId: notebookId ?? undefined })}
            data-testid="button-new-chat"
            className="h-8"
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> New
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setChatCollapsed(true)}
            data-testid="button-collapse-chat"
            className="h-8 w-8"
            title="Hide panel"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        <ScrollArea className="h-full" ref={scrollRef}>
          <div className="flex flex-col gap-3 p-4 pb-2">
            {messages.length === 0 && !streamingMessage && !pendingUserMessage && (
              <div className="text-sm text-muted-foreground text-center py-8 space-y-2">
                <p>Ask anything about Athletic Training or the BOC blueprint.</p>
                <p className="text-xs">Tip: attach a PDF, lecture notes, or screenshot.</p>
              </div>
            )}
            {messages.map((m, idx) => {
              const isLastAssistant =
                m.role === "assistant" && idx === messages.length - 1 && !streamingMessage && !streaming;
              const showFollowups = isLastAssistant && Array.isArray(m.followups) && m.followups.length > 0;
              return (
                <div key={m.id} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[88%] min-w-0 rounded-lg px-3 py-2 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                    data-testid={`chat-msg-${m.role}`}
                  >
                    {m.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                    ) : (
                      <MarkdownMessage content={m.content} className="text-sm" />
                    )}
                  </div>
                  {m.role === "assistant" && m.content && (
                    <CopyMessageButton
                      content={m.content}
                      testId={`button-copy-message-${m.id}`}
                    />
                  )}
                  {showFollowups && activeConvId && (
                    <FollowupChips
                      items={m.followups as string[]}
                      onPick={(q) => sendMessage(q, activeConvId)}
                    />
                  )}
                </div>
              );
            })}
            {pendingUserMessage && (
              <div className="flex flex-col gap-1 items-end" data-testid="chat-msg-user-pending">
                <div className="max-w-[88%] min-w-0 rounded-lg px-3 py-2 bg-primary text-primary-foreground opacity-90">
                  <p className="text-sm whitespace-pre-wrap break-words">{pendingUserMessage}</p>
                </div>
              </div>
            )}
            {(displayedStream || (streaming && pendingUserMessage)) && (
              <div className="flex justify-start" data-testid="chat-msg-assistant-streaming">
                <div className="max-w-[88%] min-w-0 rounded-lg px-3 py-2 bg-muted">
                  {displayedStream ? (
                    <MarkdownMessage content={displayedStream} className="text-sm" />
                  ) : (
                    <span className="inline-flex gap-1 py-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
                    </span>
                  )}
                </div>
              </div>
            )}
            {!streaming && !streamingMessage && pendingFollowups.length > 0 && messages.length > 0 &&
              messages[messages.length - 1].role !== "assistant" && activeConvId && (
                <div className="flex flex-col items-start">
                  <FollowupChips items={pendingFollowups} onPick={(q) => sendMessage(q, activeConvId)} />
                </div>
              )}
          </div>
        </ScrollArea>
      </div>

      <div className="relative p-3 border-t bg-background space-y-2 shrink-0">
        {!atBottom && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={scrollToLatest}
            data-testid="button-scroll-to-latest"
            className="absolute -top-4 left-1/2 -translate-x-1/2 z-10 h-7 px-2.5 text-xs shadow-lg rounded-full"
          >
            <ArrowDown className="h-3.5 w-3.5 mr-1" />
            {streaming ? "Jump to latest" : "Scroll to latest"}
          </Button>
        )}
        {pendingFile && (
          <div className="flex flex-col gap-2 rounded-md border bg-muted/50 p-2">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <Badge variant="outline" className="truncate max-w-full min-w-0" data-testid="chip-pending-file">
                <Paperclip className="h-3 w-3 mr-1 shrink-0" />
                <span className="truncate">{pendingFile.name}</span>
              </Badge>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 shrink-0"
                onClick={() => {
                  setPendingFile(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                data-testid="button-remove-attachment"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={saveForStudy} onCheckedChange={(c) => setSaveForStudy(!!c)} data-testid="checkbox-save-for-study" />
              <BookmarkPlus className="h-3 w-3" />
              <span>Save to library</span>
            </label>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (activeConvId) sendMessage(input, activeConvId);
          }}
          className="flex gap-2 items-end"
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.txt,.md,.csv,.json,.html,.xml,.rtf,image/*"
            onChange={onPickFile}
            data-testid="input-file-upload"
          />
          <Button
            type="button"
            size="icon"
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={!activeConvId || uploading || streaming}
            data-testid="button-attach-file"
            className="shrink-0"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <Textarea
            ref={chatInputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (activeConvId && !streaming && !uploading && (input.trim() || pendingFile)) {
                  sendMessage(input, activeConvId);
                }
              }
            }}
            rows={1}
            placeholder={pendingFile ? "Add a question…" : "Ask your tutor…"}
            disabled={!activeConvId || streaming}
            data-testid="input-chat-message"
            className="min-w-0 min-h-9 max-h-40 resize-none overflow-y-auto py-1.5"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!activeConvId || streaming || uploading || (!input.trim() && !pendingFile)}
            data-testid="button-send-message"
            className="shrink-0"
          >
            {streaming || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </aside>
    </>
  );
}
