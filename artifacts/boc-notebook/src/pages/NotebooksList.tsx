import { useListNotebooks, useCreateNotebook } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { Book, Plus, BookOpen, Brain, FileUp, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotebooksQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLocation } from "wouter";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
});

const NEW_NOTEBOOK_VALUE = "__new__";

export default function NotebooksList() {
  const { data: notebooks = [], isLoading } = useListNotebooks();
  const createNotebook = useCreateNotebook();
  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [targetNotebookId, setTargetNotebookId] = useState<string>("");
  const [newNotebookTitle, setNewNotebookTitle] = useState("");
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", description: "" },
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    createNotebook.mutate({ data: values }, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListNotebooksQueryKey() });
      }
    });
  };

  const resetImport = () => {
    setPendingFile(null);
    setTargetNotebookId("");
    setNewNotebookTitle("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleImportOpenChange = (next: boolean) => {
    setImportOpen(next);
    if (!next) resetImport();
  };

  const onImport = async () => {
    if (!pendingFile) {
      toast({ title: "Pick a file first", variant: "destructive" });
      return;
    }
    const creatingNew = targetNotebookId === NEW_NOTEBOOK_VALUE || !targetNotebookId;
    if (creatingNew && !newNotebookTitle.trim()) {
      toast({ title: "Notebook title required", description: "Enter a title for the new notebook.", variant: "destructive" });
      return;
    }
    setImporting(true);
    let createdNotebookId: number | null = null;
    try {
      let notebookId: number;
      if (creatingNew) {
        const created = await createNotebook.mutateAsync({
          data: { title: newNotebookTitle.trim() },
        });
        notebookId = created.id;
        createdNotebookId = created.id;
      } else {
        notebookId = Number(targetNotebookId);
      }
      const fd = new FormData();
      fd.append("file", pendingFile);
      const res = await fetch(`/api/notebooks/${notebookId}/import`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: "Import failed", description: err.error ?? "Unknown error", variant: "destructive" });
        if (createdNotebookId != null) {
          await fetch(`/api/notebooks/${createdNotebookId}`, { method: "DELETE" }).catch(() => {});
          queryClient.invalidateQueries({ queryKey: getListNotebooksQueryKey() });
        }
        return;
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: getListNotebooksQueryKey() });
      const noteId = data?.note?.id;
      const noteHref = noteId
        ? `/notebooks/${notebookId}?note=${noteId}`
        : `/notebooks/${notebookId}`;
      toast({
        title: `Imported ${data.filename}`,
        description: `${data.extractedChars.toLocaleString()} characters extracted.`,
        action: (
          <ToastAction altText="Open note" onClick={() => navigate(noteHref)}>
            Open note
          </ToastAction>
        ),
      });
      handleImportOpenChange(false);
    } catch (err) {
      toast({ title: "Import failed", description: String(err), variant: "destructive" });
      if (createdNotebookId != null) {
        await fetch(`/api/notebooks/${createdNotebookId}`, { method: "DELETE" }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: getListNotebooksQueryKey() });
      }
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Notebooks</h1>
        <div className="flex gap-2">
          <Dialog open={importOpen} onOpenChange={handleImportOpenChange}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="btn-import-pdf">
                <FileUp className="w-4 h-4 mr-2" /> Import from PDF
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import from PDF</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="import-file">File (PDF, TXT, or MD)</Label>
                  <Input
                    id="import-file"
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                    onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
                    data-testid="input-import-file"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Save to notebook</Label>
                  <Select value={targetNotebookId} onValueChange={setTargetNotebookId}>
                    <SelectTrigger data-testid="select-import-notebook">
                      <SelectValue placeholder="Create a new notebook…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW_NOTEBOOK_VALUE}>+ Create new notebook…</SelectItem>
                      {notebooks.map((nb) => (
                        <SelectItem key={nb.id} value={String(nb.id)}>
                          {nb.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(targetNotebookId === NEW_NOTEBOOK_VALUE || !targetNotebookId) && (
                  <div className="space-y-2">
                    <Label htmlFor="new-notebook-title">New notebook title</Label>
                    <Input
                      id="new-notebook-title"
                      value={newNotebookTitle}
                      onChange={(e) => setNewNotebookTitle(e.target.value)}
                      placeholder={pendingFile?.name.replace(/\.(pdf|txt|md)$/i, "") ?? "My imported notes"}
                      data-testid="input-new-notebook-title"
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => handleImportOpenChange(false)} disabled={importing}>
                    Cancel
                  </Button>
                  <Button onClick={onImport} disabled={importing || !pendingFile} data-testid="submit-import-pdf">
                    {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileUp className="w-4 h-4 mr-2" />}
                    Import
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="btn-new-notebook"><Plus className="w-4 h-4 mr-2" /> New Notebook</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Notebook</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl><Input {...field} data-testid="input-notebook-title" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl><Input {...field} data-testid="input-notebook-desc" /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" disabled={createNotebook.isPending} data-testid="submit-new-notebook">
                    Create
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {notebooks.map((nb) => (
            <Link key={nb.id} href={`/notebooks/${nb.id}`}>
              <Card className="hover-elevate cursor-pointer h-full">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Book className="w-5 h-5 text-primary" />
                    {nb.title}
                  </CardTitle>
                  {nb.description && <CardDescription>{nb.description}</CardDescription>}
                </CardHeader>
                <CardContent className="flex gap-4 text-sm text-muted-foreground mt-auto">
                  <div className="flex items-center gap-1"><BookOpen className="w-4 h-4"/> {nb.noteCount} Notes</div>
                  <div className="flex items-center gap-1"><Brain className="w-4 h-4"/> {nb.flashcardCount} Cards</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
