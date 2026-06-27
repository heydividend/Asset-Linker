import { useMemo, useState } from "react";
import { BookmarkPlus } from "lucide-react";
import { Link } from "wouter";
import {
  useListNotebooks,
  useCreateNote,
  useSaveStudyGuide,
  getListNotebooksQueryKey,
  getGetNotebookQueryKey,
  getListStudyGuidesQueryKey,
  getListAllStudyGuidesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { markdownToPlainText } from "@/lib/markdown-to-text";
import { cn } from "@/lib/utils";

interface SaveMessageButtonProps {
  content: string;
  className?: string;
  testId?: string;
}

type Destination = "note" | "study-guide";

function deriveTitle(content: string): string {
  const plain = markdownToPlainText(content).trim();
  const firstLine = plain.split("\n").map((l) => l.trim()).find((l) => l.length > 0) ?? "";
  const title = firstLine.length > 0 ? firstLine : "AI Tutor response";
  return title.slice(0, 80);
}

export function SaveMessageButton({ content, className, testId }: SaveMessageButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState<Destination>("note");
  const [notebookId, setNotebookId] = useState<string>("");
  const [title, setTitle] = useState("");

  const queryClient = useQueryClient();
  const { data: notebooks = [] } = useListNotebooks();
  const createNote = useCreateNote();
  const saveStudyGuide = useSaveStudyGuide();
  const saving = createNote.isPending || saveStudyGuide.isPending;

  const defaultTitle = useMemo(() => deriveTitle(content), [content]);

  const openDialog = () => {
    setTitle(defaultTitle);
    setNotebookId(notebooks.length > 0 ? String(notebooks[0].id) : "");
    setOpen(true);
  };

  const handleSave = () => {
    const id = Number(notebookId);
    const trimmedTitle = title.trim() || defaultTitle;
    if (!Number.isFinite(id) || id <= 0) {
      toast({ title: "Pick a notebook first", variant: "destructive" });
      return;
    }
    const onError = () => {
      toast({ title: "Couldn't save", description: "Please try again.", variant: "destructive" });
    };

    if (destination === "note") {
      createNote.mutate(
        { id, data: { title: trimmedTitle, content, sourceKind: "text" } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListNotebooksQueryKey() });
            queryClient.invalidateQueries({ queryKey: getGetNotebookQueryKey(id) });
            toast({ title: "Saved to notebook" });
            setOpen(false);
          },
          onError,
        },
      );
    } else {
      saveStudyGuide.mutate(
        { id, data: { title: trimmedTitle, content } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetNotebookQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getListStudyGuidesQueryKey(id) });
            queryClient.invalidateQueries({ queryKey: getListAllStudyGuidesQueryKey() });
            toast({ title: "Saved to study guides" });
            setOpen(false);
          },
          onError,
        },
      );
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={openDialog}
        className={cn("h-6 px-1.5 gap-1 text-muted-foreground hover:text-foreground", className)}
        title="Save to a notebook or study guide"
        data-testid={testId ?? "button-save-message"}
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
        <span className="text-[11px]">Save</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save AI response</DialogTitle>
            <DialogDescription>
              Save this response into one of your notebooks as a note or a study guide.
            </DialogDescription>
          </DialogHeader>

          {notebooks.length === 0 ? (
            <div className="text-sm text-muted-foreground space-y-3 py-2">
              <p>You don't have any notebooks yet.</p>
              <Button asChild variant="secondary" size="sm" onClick={() => setOpen(false)}>
                <Link href="/notebooks">Create a notebook</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-1">
              <div className="space-y-2">
                <Label>Save as</Label>
                <RadioGroup
                  value={destination}
                  onValueChange={(v) => setDestination(v as Destination)}
                  className="flex gap-4"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="note" id="save-as-note" data-testid="radio-save-note" />
                    <Label htmlFor="save-as-note" className="font-normal cursor-pointer">Note</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="study-guide" id="save-as-guide" data-testid="radio-save-guide" />
                    <Label htmlFor="save-as-guide" className="font-normal cursor-pointer">Study guide</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="save-notebook">Notebook</Label>
                <Select value={notebookId} onValueChange={setNotebookId}>
                  <SelectTrigger id="save-notebook" data-testid="select-save-notebook">
                    <SelectValue placeholder="Choose a notebook" />
                  </SelectTrigger>
                  <SelectContent>
                    {notebooks.map((n) => (
                      <SelectItem key={n.id} value={String(n.id)}>{n.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="save-title">Title</Label>
                <Input
                  id="save-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={defaultTitle}
                  data-testid="input-save-title"
                />
              </div>
            </div>
          )}

          {notebooks.length > 0 && (
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !notebookId} data-testid="button-confirm-save">
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
