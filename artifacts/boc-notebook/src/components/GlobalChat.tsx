import { useChatStore } from "@/hooks/use-chat";
import { Button } from "@/components/ui/button";
import { Bot, Send, Paperclip, X, Loader2, BookmarkPlus } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useState, useRef, useEffect } from "react";
import {
  useListOpenaiMessages,
  useCreateOpenaiConversation,
  getListOpenaiMessagesQueryKey,
  getListOpenaiConversationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function GlobalChat() {
  const { isOpen, setOpen, conversationId, notebookId, initialContext, openChat } = useChatStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [input, setInput] = useState("");
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [streamingMessage, setStreamingMessage] = useState<string>("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saveForStudy, setSaveForStudy] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useListOpenaiMessages(activeConvId!, {
    query: { enabled: !!activeConvId, queryKey: getListOpenaiMessagesQueryKey(activeConvId!) },
  });

  const createConv = useCreateOpenaiConversation();

  useEffect(() => {
    if (!isOpen) return;
    if (conversationId) {
      setActiveConvId(conversationId);
    } else if (!activeConvId) {
      createConv.mutate(
        { data: { title: initialContext ? initialContext.slice(0, 60) : "New Conversation", notebookId: notebookId ?? undefined } },
        {
          onSuccess: (data) => {
            setActiveConvId(data.id);
            queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
            if (initialContext) sendMessage(initialContext, data.id);
          },
        },
      );
    } else if (initialContext) {
      sendMessage(initialContext, activeConvId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, conversationId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingMessage]);

  const uploadFile = async (convId: number) => {
    if (!pendingFile) return;
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
        description: data.savedNoteId ? "Saved to your library for future study." : "Available to the tutor for this chat.",
      });
      queryClient.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(convId) });
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setUploading(false);
    }
  };

  const sendMessage = async (text: string, convId: number = activeConvId!) => {
    if (!convId) return;
    const trimmed = text.trim();

    if (pendingFile) {
      await uploadFile(convId);
    }
    if (!trimmed && !pendingFile) return;
    if (!trimmed) {
      queryClient.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(convId) });
      return;
    }

    setInput("");
    setStreamingMessage("");
    setStreaming(true);

    try {
      const res = await fetch(`/api/openai/conversations/${convId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: trimmed }),
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
              queryClient.invalidateQueries({ queryKey: getListOpenaiMessagesQueryKey(convId) });
              queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
              setStreamingMessage("");
              setStreaming(false);
              return;
            }
            if (json.error) {
              toast({ title: "AI error", description: json.error, variant: "destructive" });
              setStreaming(false);
              return;
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
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setPendingFile(f);
  };

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg"
          onClick={() => openChat()}
          data-testid="button-global-chat"
        >
          <Bot className="h-6 w-6" />
        </Button>
      </div>

      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] flex flex-col p-0">
          <SheetHeader className="p-4 border-b">
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              AI Tutor
            </SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-hidden relative">
            <ScrollArea className="h-full p-4" ref={scrollRef}>
              <div className="flex flex-col gap-4 pb-4">
                {messages.length === 0 && !streamingMessage && (
                  <div className="text-sm text-muted-foreground text-center py-8 space-y-2">
                    <p>Ask anything about Athletic Training or the BOC blueprint.</p>
                    <p className="text-xs">Tip: attach a PDF, lecture notes, or screenshot — I'll learn from it for this chat, and optionally save it to your library for future study.</p>
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-lg px-4 py-2 ${m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`} data-testid={`chat-msg-${m.role}`}>
                      <p className="text-sm whitespace-pre-wrap break-words">{m.content}</p>
                    </div>
                  </div>
                ))}
                {streamingMessage && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-lg px-4 py-2 bg-muted">
                      <p className="text-sm whitespace-pre-wrap break-words">{streamingMessage}</p>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="p-4 border-t bg-background space-y-2">
            {pendingFile && (
              <div className="flex flex-col gap-2 rounded-md border bg-muted/50 p-2">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="truncate max-w-[260px]" data-testid="chip-pending-file">
                    <Paperclip className="h-3 w-3 mr-1" />
                    {pendingFile.name}
                  </Badge>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6"
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
                  Save to my library so the tutor can use it for future study
                </label>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                sendMessage(input);
              }}
              className="flex gap-2"
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
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={pendingFile ? "Add a question about this file…" : "Ask your tutor…"}
                disabled={!activeConvId || streaming}
                data-testid="input-chat-message"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!activeConvId || streaming || uploading || (!input.trim() && !pendingFile)}
                data-testid="button-send-message"
              >
                {streaming || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </form>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
