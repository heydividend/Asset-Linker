import { useEffect, useMemo, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useNotificationPermission } from "@/hooks/use-notification-permission";
import {
  usePushReminders,
  enablePushSubscription,
  disablePushSubscription,
  saveReminderPreferences,
  sendTestReminder,
} from "@/hooks/use-push-reminders";

// 0=Sunday … 6=Saturday (matches JS Date.getDay and the server's convention).
const WEEKDAYS = [
  { value: 0, short: "Sun" },
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
];

// A curated set of common timezones. The user's current preference and the
// browser-detected zone are merged in so any saved value is always selectable.
const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Phoenix",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Athens",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

function labelForTimezone(tz: string): string {
  return tz.replace(/_/g, " ");
}

// Self-contained panel for managing daily study reminders. Reuses the existing
// notification-permission hook to surface granted/denied/unsupported states.
export function ReminderSettings() {
  const { toast } = useToast();
  const { permission, request } = useNotificationPermission();
  const { supported, prefs, isLoading, busy, setBusy, invalidate } =
    usePushReminders();

  const prefTimezone = prefs.timezone ?? "America/Los_Angeles";
  const prefSkippedDays = prefs.skippedDays ?? [];

  const [time, setTime] = useState(prefs.time);
  const [timezone, setTimezone] = useState(prefTimezone);
  const [skippedDays, setSkippedDays] = useState<number[]>(prefSkippedDays);
  useEffect(() => {
    setTime(prefs.time);
    setTimezone(prefTimezone);
    setSkippedDays(prefSkippedDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.time, prefTimezone, JSON.stringify(prefSkippedDays)]);

  const enabled = prefs.enabled;

  // Always include the saved + browser-detected zones so the Select never shows
  // an empty value for a timezone outside the curated list.
  const timezoneOptions = useMemo(() => {
    const set = new Set<string>(COMMON_TIMEZONES);
    set.add(detectBrowserTimezone());
    if (timezone) set.add(timezone);
    return [...set].sort();
  }, [timezone]);

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
        await saveReminderPreferences({
          enabled: true,
          time,
          timezone,
          skippedDays,
        });
        toast({
          title: "Daily reminders on",
          description: `You'll get a study nudge at ${time} each day — even with this tab closed.`,
        });
      } else {
        await saveReminderPreferences({
          enabled: false,
          time,
          timezone,
          skippedDays,
        });
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

  // Persist any preference field change (time, timezone, skipped days) when
  // reminders are enabled. Local state is updated optimistically by callers.
  const persist = async (
    overrides: Partial<{
      time: string;
      timezone: string;
      skippedDays: number[];
    }>,
    successTitle: string,
    successDescription: string,
  ) => {
    if (!enabled) return;
    setBusy(true);
    try {
      await saveReminderPreferences({
        enabled: true,
        time,
        timezone,
        skippedDays,
        ...overrides,
      });
      invalidate();
      toast({ title: successTitle, description: successDescription });
    } catch (e) {
      toast({
        title: "Couldn't save your reminder settings",
        description: e instanceof Error ? e.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onSaveTime = async (nextTime: string) => {
    setTime(nextTime);
    await persist(
      { time: nextTime },
      "Reminder time updated",
      `Daily reminders will now arrive at ${nextTime}.`,
    );
  };

  const onChangeTimezone = async (nextTz: string) => {
    setTimezone(nextTz);
    await persist(
      { timezone: nextTz },
      "Timezone updated",
      `Reminders now follow ${labelForTimezone(nextTz)} time.`,
    );
  };

  const onChangeSkippedDays = async (values: string[]) => {
    const next = values.map((v) => Number(v)).sort((a, b) => a - b);
    setSkippedDays(next);
    const skippedLabels = WEEKDAYS.filter((d) => next.includes(d.value)).map(
      (d) => d.short,
    );
    await persist(
      { skippedDays: next },
      "Rest days updated",
      skippedLabels.length
        ? `No reminders on ${skippedLabels.join(", ")}.`
        : "Reminders will arrive every day.",
    );
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Label htmlFor="reminder-timezone" className="text-xs text-muted-foreground">
          Timezone
        </Label>
        <Select value={timezone} onValueChange={onChangeTimezone} disabled={busy}>
          <SelectTrigger
            id="reminder-timezone"
            className="h-8 w-56"
            data-testid="select-reminder-timezone"
          >
            <SelectValue placeholder="Choose a timezone" />
          </SelectTrigger>
          <SelectContent>
            {timezoneOptions.map((tz) => (
              <SelectItem key={tz} value={tz}>
                {labelForTimezone(tz)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-4 space-y-2">
        <Label className="text-xs text-muted-foreground">
          Rest days (no reminder)
        </Label>
        <ToggleGroup
          type="multiple"
          variant="outline"
          size="sm"
          value={skippedDays.map(String)}
          onValueChange={onChangeSkippedDays}
          disabled={busy}
          className="flex-wrap justify-start gap-1"
          data-testid="toggle-skipped-days"
        >
          {WEEKDAYS.map((d) => (
            <ToggleGroupItem
              key={d.value}
              value={String(d.value)}
              aria-label={`Skip ${d.short}`}
              className="h-8 w-11"
              data-testid={`toggle-skip-day-${d.value}`}
            >
              {d.short}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-[11px] text-muted-foreground">
          Tap a day to silence reminders on it — handy for your rest day.
        </p>
      </div>
    </div>
  );
}
