import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotificationPermission } from "@/hooks/use-notification-permission";

export function NotificationPermissionPrompt() {
  const { shouldPrompt, request, dismissPrompt } = useNotificationPermission();

  if (!shouldPrompt) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border bg-card p-4 shadow-lg"
      data-testid="notification-permission-prompt"
    >
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="flex-1">
          <p className="text-sm font-medium">Get notified when a study group round times out</p>
          <p className="mt-1 text-xs text-muted-foreground">
            We'll let you know on your device — even if this tab isn't open — so you can jump back
            in.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                void request();
              }}
              data-testid="button-enable-notifications"
            >
              Enable
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={dismissPrompt}
              data-testid="button-dismiss-notifications"
            >
              Not now
            </Button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={dismissPrompt}
          className="text-muted-foreground hover:text-foreground"
          data-testid="button-close-notifications-prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
