import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWarehouse } from "@/store/warehouse";
import { fmtAgo } from "@/store/engine";
import { Bell, BellRing, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router";

const typeIcon: Record<string, string> = {
  "Critical Stock": "bg-danger/10 text-danger",
  "Order Delay": "bg-warn/10 text-warn",
  "Allocation Conflict": "bg-copper/10 text-copper",
  Exception: "bg-danger/10 text-danger",
  Bottleneck: "bg-warn/10 text-warn",
  Reorder: "bg-info/10 text-info",
};

export function NotificationCenter() {
  const { state, markNotificationRead, markAllNotificationsRead } = useWarehouse();
  const navigate = useNavigate();
  const unread = state.notifications.filter((n) => !n.read).length;

  const open = (id: string, to?: string) => {
    markNotificationRead(id);
    if (to) navigate(to);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative text-muted-foreground" aria-label={`Notifications (${unread} unread)`}>
          {unread > 0 ? <BellRing className="size-[18px]" /> : <Bell className="size-[18px]" />}
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-danger text-[9px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="text-sm font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground" onClick={markAllNotificationsRead}>
            <CheckCheck className="size-3.5" />
            Mark all read
          </Button>
        </div>
        <ScrollArea className="h-[min(60vh,420px)]">
          {state.notifications.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">All caught up.</p>
          )}
          <div className="divide-y divide-border/60">
            {state.notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => open(n.id, n.navigateTo)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40",
                  !n.read && "bg-accent/20",
                )}
              >
                <span className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full", typeIcon[n.type] ?? "bg-muted text-muted-foreground")}>
                  <Bell className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className={cn("truncate text-[13px] font-medium", !n.read && "text-foreground")}>{n.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{fmtAgo(n.createdAt)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-xs leading-5 text-muted-foreground">{n.body}</span>
                </span>
                {!n.read && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-copper" aria-label="Unread" />}
              </button>
            ))}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
