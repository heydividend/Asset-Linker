import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime } from "@/lib/formatDate";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMe } from "@/hooks/use-me";
import {
  ShieldAlert,
  UserPlus,
  KeyRound,
  Trash2,
  BarChart3,
  Activity as ActivityIcon,
} from "lucide-react";

type AdminUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  banned: boolean;
  isAdmin: boolean;
  createdAt: number;
  lastSignInAt: number | null;
  progress: {
    answered: number;
    correct: number;
    readiness: number | null;
    lastActiveAt: string | null;
  };
};

type LoginSession = {
  id: number;
  userId: string;
  email: string | null;
  userAgent: string | null;
  startedAt: string;
  lastSeenAt: string;
};

type ActivityEvent = {
  id: string;
  type: "quiz" | "mock" | "daily" | "tutor" | "game";
  userId: string;
  email?: string | null;
  title: string;
  detail: string | null;
  at: string;
};

const ACTIVITY_LABELS: Record<ActivityEvent["type"], string> = {
  quiz: "Quiz",
  mock: "Mock exam",
  daily: "Daily quiz",
  tutor: "AI tutor",
  game: "Game",
};

type DomainProgress = {
  domainId: number;
  code: string;
  name: string;
  correct: number;
  total: number;
  percent: number;
  scaledScore: number;
  band: string;
};

type UserProgress = {
  answered: number;
  correct: number;
  readiness: number | null;
  domainMastery: DomainProgress[];
  sessions: LoginSession[];
};

function fmtDate(value: string | number | null): string {
  if (value == null) return "—";
  return formatDateTime(value) || "—";
}

function accuracy(correct: number, answered: number): string {
  if (!answered) return "—";
  return `${Math.round((correct / answered) * 100)}%`;
}

async function jsonOrThrow(res: Response): Promise<unknown> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((body as { error?: string }).error || res.statusText);
  }
  return body;
}

function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, firstName, lastName }),
      });
      return jsonOrThrow(res);
    },
    onSuccess: () => {
      toast({ title: "User created", description: email });
      setEmail("");
      setPassword("");
      setFirstName("");
      setLastName("");
      onCreated();
    },
    onError: (err: Error) => {
      toast({
        title: "Could not create user",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4" /> Create a student account
        </CardTitle>
        <CardDescription>
          New users can only be created here — public sign-up is disabled.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-email">Email</Label>
            <Input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              data-testid="input-new-email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Password (min 8 chars)</Label>
            <Input
              id="new-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              data-testid="input-new-password"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-first">First name</Label>
            <Input
              id="new-first"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              data-testid="input-new-first"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-last">Last name</Label>
            <Input
              id="new-last"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              data-testid="input-new-last"
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="submit"
              disabled={mutation.isPending}
              data-testid="button-create-user"
            >
              {mutation.isPending ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function ProgressDialog({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<UserProgress>({
    queryKey: [`/api/admin/users/${user.id}/progress`],
    queryFn: () =>
      fetch(`/api/admin/users/${user.id}/progress`, {
        credentials: "include",
      }).then((r) => r.json()),
  });

  const activityQuery = useQuery<{ activity: ActivityEvent[] }>({
    queryKey: [`/api/admin/users/${user.id}/activity`],
    queryFn: () =>
      fetch(`/api/admin/users/${user.id}/activity`, {
        credentials: "include",
      }).then((r) => r.json()),
  });
  const activity = activityQuery.data?.activity ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{user.email ?? user.id}</DialogTitle>
          <DialogDescription>
            Study progress and domain mastery
          </DialogDescription>
        </DialogHeader>
        {isLoading || !data ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading…
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Readiness: </span>
                <span className="font-semibold">
                  {data.readiness ?? "—"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Answered: </span>
                <span className="font-semibold">{data.answered}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Accuracy: </span>
                <span className="font-semibold">
                  {accuracy(data.correct, data.answered)}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              {data.domainMastery.map((d) => (
                <div key={d.domainId} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {d.code} · {d.name}
                    </span>
                    <span className="text-muted-foreground">
                      {d.total > 0 ? `${d.percent}% (${d.correct}/${d.total})` : "no data"}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${d.percent}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground">{d.band}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-semibold">Activity timeline</div>
              {activityQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading activity…</p>
              ) : activity.length === 0 ? (
                <p className="text-xs text-muted-foreground">No activity yet.</p>
              ) : (
                <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                  {activity.map((e) => (
                    <div
                      key={e.id}
                      className="flex items-start justify-between gap-3 rounded-md border p-2 text-xs"
                      data-testid={`user-activity-${e.id}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{ACTIVITY_LABELS[e.type]}</Badge>
                          <span className="font-medium">{e.title}</span>
                        </div>
                        {e.detail && (
                          <div className="mt-0.5 truncate text-muted-foreground">
                            {e.detail}
                          </div>
                        )}
                      </div>
                      <div className="whitespace-nowrap text-muted-foreground">
                        {fmtDate(e.at)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      return jsonOrThrow(res);
    },
    onSuccess: () => {
      toast({ title: "Password updated", description: user.email ?? user.id });
      onClose();
    },
    onError: (err: Error) =>
      toast({
        title: "Could not update password",
        description: err.message,
        variant: "destructive",
      }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>{user.email ?? user.id}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="reset-password">New password (min 8 chars)</Label>
          <Input
            id="reset-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            data-testid="input-reset-password"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || password.length < 8}
            data-testid="button-confirm-reset"
          >
            {mutation.isPending ? "Saving…" : "Update password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDashboard() {
  const me = useMe();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [progressUser, setProgressUser] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);

  const usersQuery = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: () =>
      fetch("/api/admin/users", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Forbidden");
        return r.json();
      }),
    enabled: me.data?.isAdmin === true,
  });

  const sessionsQuery = useQuery<{ sessions: LoginSession[] }>({
    queryKey: ["/api/admin/sessions"],
    queryFn: () =>
      fetch("/api/admin/sessions", { credentials: "include" }).then((r) =>
        r.json(),
      ),
    enabled: me.data?.isAdmin === true,
  });

  const activityQuery = useQuery<{ activity: ActivityEvent[] }>({
    queryKey: ["/api/admin/activity"],
    queryFn: () =>
      fetch("/api/admin/activity", { credentials: "include" }).then((r) =>
        r.json(),
      ),
    enabled: me.data?.isAdmin === true,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      return jsonOrThrow(res);
    },
    onSuccess: () => {
      toast({ title: "User deleted" });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) =>
      toast({
        title: "Could not delete user",
        description: err.message,
        variant: "destructive",
      }),
  });

  if (me.isLoading) {
    return (
      <div className="p-8 text-sm text-muted-foreground">Loading…</div>
    );
  }

  if (!me.data?.isAdmin) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You don't have access to this page.
        </p>
      </div>
    );
  }

  const users = usersQuery.data?.users ?? [];
  const sessions = sessionsQuery.data?.sessions ?? [];
  const activity = activityQuery.data?.activity ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage accounts, track progress, and review login activity.
        </p>
      </div>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users" data-testid="tab-users">
            Users
          </TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity">
            Activity
          </TabsTrigger>
          <TabsTrigger value="sessions" data-testid="tab-sessions">
            Login Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <CreateUserForm
            onCreated={() =>
              qc.invalidateQueries({ queryKey: ["/api/admin/users"] })
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Users ({users.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Readiness</TableHead>
                    <TableHead>Accuracy</TableHead>
                    <TableHead>Last active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} data-testid={`row-user-${u.id}`}>
                      <TableCell>
                        <div className="font-medium">{u.email ?? "—"}</div>
                        {(u.firstName || u.lastName) && (
                          <div className="text-xs text-muted-foreground">
                            {[u.firstName, u.lastName].filter(Boolean).join(" ")}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {u.isAdmin ? (
                          <Badge>Admin</Badge>
                        ) : (
                          <Badge variant="secondary">Student</Badge>
                        )}
                      </TableCell>
                      <TableCell>{u.progress.readiness ?? "—"}</TableCell>
                      <TableCell>
                        {accuracy(u.progress.correct, u.progress.answered)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(u.progress.lastActiveAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="View progress"
                            onClick={() => setProgressUser(u)}
                            data-testid={`button-progress-${u.id}`}
                          >
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Reset password"
                            onClick={() => setResetUser(u)}
                            data-testid={`button-reset-${u.id}`}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Delete user"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Delete ${u.email ?? u.id}? This cannot be undone.`,
                                )
                              ) {
                                deleteMutation.mutate(u.id);
                              }
                            }}
                            data-testid={`button-delete-${u.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {users.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center text-sm text-muted-foreground"
                      >
                        {usersQuery.isLoading ? "Loading…" : "No users yet."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ActivityIcon className="h-4 w-4" /> Recent activity ({activity.length})
              </CardTitle>
              <CardDescription>
                Quizzes, mock exams, daily quizzes, AI tutor chats, and games
                across all users.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activity.map((e) => (
                    <TableRow key={e.id} data-testid={`row-activity-${e.id}`}>
                      <TableCell className="font-medium">
                        {e.email ?? e.userId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{ACTIVITY_LABELS[e.type]}</Badge>
                      </TableCell>
                      <TableCell>{e.title}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground">
                        {e.detail ?? "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {fmtDate(e.at)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {activity.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-sm text-muted-foreground"
                      >
                        {activityQuery.isLoading ? "Loading…" : "No activity yet."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Recent login sessions ({sessions.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Last seen</TableHead>
                    <TableHead>Device</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map((s) => (
                    <TableRow key={s.id} data-testid={`row-session-${s.id}`}>
                      <TableCell className="font-medium">
                        {s.email ?? s.userId}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(s.startedAt)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtDate(s.lastSeenAt)}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-xs text-muted-foreground">
                        {s.userAgent ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                  {sessions.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-sm text-muted-foreground"
                      >
                        {sessionsQuery.isLoading ? "Loading…" : "No sessions yet."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {progressUser && (
        <ProgressDialog
          user={progressUser}
          onClose={() => setProgressUser(null)}
        />
      )}
      {resetUser && (
        <ResetPasswordDialog
          user={resetUser}
          onClose={() => setResetUser(null)}
        />
      )}
    </div>
  );
}
