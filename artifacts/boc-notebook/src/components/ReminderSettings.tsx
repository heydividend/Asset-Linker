import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useNotificationPermission } from "@/hooks/use-notification-permission";
import {
  usePushReminders,
  enablePushSubscription,
  disablePushSubscription,
  saveReminderPreferences,
  sendTestReminder,
} from "@/hooks/use-push-reminders";

// Self-contained panel for managing daily study reminders. Reuses the existing
// notification-permission hook to surface granted/denied/unsupported states.
export function ReminderSettings() {
  const { toast } = useToast();
  const { permission, request } = useNotificationPermission();
  const { supported, prefs, isLoading, busy, setBusy, invalidate } =
    usePushReminders();

  const [time, setTime] = useState(prefs.time);
  useEffect(() => {
    setTime(prefs.time);
  }, [prefs.time]);

  const enabled = prefs.enabled;

  const onToggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        if (permission !== "granted") {
          const result = await request();
          if (result !== "granted") {
            toast({
              title: "Notifications blocked",
              description:
                "Allow notifications in your browser to receive daily reminders.",
              variant: "destructive",
            });
            return;
          }
        }
        await enablePushSubscription();
        await saveReminderPreferences({ enabled: true, time });
        toast({
          title: "Daily reminders on",
          description: `You'll get a study nudge at ${time} each day — even with this tab closed.`,
        });
      } else {
        await saveReminderPreferences({ enabled: false, time });
        await disablePushSubscription();
        toast({
          title: "Daily reminders off",
          description: "You won't receive study reminders anymore.",
        });
      }
      invalidate();
    } catch (e) {
      toast({
        title: "Couldn't update reminders",
        description:
          e instanceof Error && e.message !== "unsupported"
            ? e.message
            : "Your browser may not support push notifications.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onSaveTime = async (nextTime: string) => {
    setTime(nextTime);
    if (!enabled) return;
    setBusy(true);
    try {
      await saveReminderPreferences({ enabled: true, time: nextTime });
      invalidate();
      toast({
        title: "Reminder time updated",
        description: `Daily reminders will now arrive at ${nextTime}.`,
      });
    } catch (e) {
      toast({
        title: "Couldn't save the time",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onTest = async () => {
    setBusy(true);
    try {
      const sent = await sendTestReminder();
      toast({
        title: sent > 0 ? "Test reminder sent" : "No devices subscribed yet",
        description:
          sent > 0
            ? "Check your notifications — it should arrive shortly."
            : "Turn reminders on first so this browser is subscribed.",
      });
    } catch (e) {
      toast({
        title: "Couldn't send a test",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <BellOff className="h-4 w-4" /> Daily reminders
        </div>
        <p className="mt-1">
          This browser doesn't support background push notifications, so daily
          reminders aren't available here. Try a desktop browser like Chrome,
          Edge, or Firefox.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border p-4" data-testid="reminder-settings">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <Label
            htmlFor="reminder-toggle"
            className="flex items-center gap-2 text-sm font-medium"
          >
            <Bell className="h-4 w-4 text-primary" /> Daily study reminders
          </Label>
          <p className="text-xs text-muted-foreground">
            Get a desktop notification with today's plan — even when this tab is
            closed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(busy || isLoading) && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          <Switch
            id="reminder-toggle"
            checked={enabled}
            disabled={busy || isLoading}
            onCheckedChange={onToggle}
            data-testid="switch-daily-reminders"
          />
        </div>
      </div>

      {permission === "denied" && (
        <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Notifications are blocked in your browser settings. Re-allow them for
          this site to receive reminders.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Label htmlFor="reminder-time" className="text-xs text-muted-foreground">
          Reminder time
        </Label>
        <Input
          id="reminder-time"
          type="time"
          value={time}
          disabled={busy}
          onChange={(e) => setTime(e.target.value)}
          onBlur={(e) => onSaveTime(e.target.value)}
          className="h-8 w-28"
          data-testid="input-reminder-time"
        />
        {enabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTest}
            disabled={busy}
            data-testid="button-test-reminder"
          >
            Send a test
          </Button>
        )}
      </div>
    </div>
  );
}
