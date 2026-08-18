import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { NotificationCenter } from "@/components/wms/NotificationCenter";
import { CommandPalette } from "@/components/wms/CommandPalette";
import { useAuth } from "@/hooks/use-auth";
import { useWarehouse } from "@/store/warehouse";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  BrainCircuit,
  ClipboardCheck,
  FlaskConical,
  Gauge,
  LogOut,
  Menu,
  Package,
  PackageOpen,
  PersonStanding,
  Search,
  Settings,
  Split,
  Truck,
  Warehouse,
} from "lucide-react";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { cn } from "@/lib/utils";
import type { AppState } from "@/store/types";

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: (s: AppState) => number;
  end?: boolean;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "Command",
    items: [{ to: "/dashboard", label: "Command Center", icon: Gauge, end: true }],
  },
  {
    section: "Operations",
    items: [
      { to: "/orders", label: "Orders", icon: Package },
      { to: "/inventory", label: "Inventory", icon: Boxes },
      { to: "/allocations", label: "Allocations", icon: Split },
    ],
  },
  {
    section: "Fulfillment",
    items: [
      { to: "/picking", label: "Picking", icon: PersonStanding },
      { to: "/packing", label: "Packing & QC", icon: PackageOpen },
      { to: "/dispatch", label: "Dispatch", icon: Truck },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { to: "/exceptions", label: "Exceptions", icon: AlertTriangle, badge: (s) => s.exceptions.filter((e) => e.status !== "Resolved").length },
      { to: "/decisions", label: "Decision Center", icon: BrainCircuit, badge: (s) => s.decisions.filter((d) => d.status === "Pending").length },
      { to: "/simulator", label: "Simulator", icon: FlaskConical },
      { to: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    section: "System",
    items: [{ to: "/settings", label: "Settings", icon: Settings }],
  },
];

function NexusMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="1" y="1" width="30" height="30" rx="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M16 6 L26 16 L16 26 L6 16 Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    </svg>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { state } = useWarehouse();
  const location = useLocation();
  return (
    <div className="flex h-full flex-col">
      <NavLink to="/dashboard" onClick={onNavigate} className="flex items-center gap-2.5 px-5 pb-5 pt-5">
        <NexusMark className="size-8 text-foreground" />
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold tracking-[0.18em]">NEXUS</p>
          <p className="text-[9px] font-medium uppercase tracking-[0.28em] text-muted-foreground">Warehouse OS</p>
        </div>
      </NavLink>
      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {NAV.map((group) => (
          <div key={group.section} className="mt-4">
            <p className="px-2.5 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
              {group.section}
            </p>
            <nav className="flex flex-col gap-0.5" aria-label={group.section}>
              {group.items.map((item) => {
                const active =
                  item.end
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to);
                const count = item.badge ? item.badge(state) : 0;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={onNavigate}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                      active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <item.icon className={cn("size-4 shrink-0", active ? "text-copper" : "text-muted-foreground group-hover:text-foreground")} />
                    <span className="flex-1 truncate">{item.label}</span>
                    {count > 0 && (
                      <span className="rounded-full bg-danger/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-danger">
                        {count}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        ))}
      </div>
      <div className="border-t border-border/70 px-5 py-4">
        <p className="text-[10px] leading-4 text-muted-foreground">
          <span className="font-semibold text-foreground">{state.settings.warehouse}</span>
          <br />
          NEXUS v1.0 · simulated live feed
        </p>
      </div>
    </div>
  );
}

function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const name = user?.name || user?.email?.split("@")[0] || "Operator";
  const initials = name.slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center gap-2 rounded-full p-0.5 transition-opacity hover:opacity-80" aria-label="Account menu">
          <Avatar className="size-8 border border-border">
            <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">{initials}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground">Warehouse Manager</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("/settings")}>
          <Settings className="size-4" /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate("/");
          }}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function AppShell() {
  const { state, updateSettings } = useWarehouse();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const currentSection = useMemo(() => {
    for (const group of NAV) {
      const found = group.items.find((i) => (i.end ? location.pathname === i.to : location.pathname.startsWith(i.to)));
      if (found) return found.label;
    }
    return "Command Center";
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[230px] border-r border-border/80 bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      {/* topbar */}
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/85 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="-ml-1 lg:hidden" aria-label="Open navigation">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[270px] p-0">
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="hidden lg:block">
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">NEXUS WMS</p>
            <p className="text-sm font-semibold leading-4">{currentSection}</p>
          </div>
          <div className="lg:hidden">
            <p className="font-display text-sm font-semibold tracking-[0.16em]">NEXUS</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Select value={state.settings.warehouse} onValueChange={(v) => updateSettings({ warehouse: v })}>
              <SelectTrigger className="h-8 w-[150px] border-border/70 bg-transparent text-xs sm:w-[180px]" aria-label="Warehouse selector">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MAIN WAREHOUSE">Main Warehouse</SelectItem>
                <SelectItem value="NORTH DOCK">North Dock</SelectItem>
                <SelectItem value="SOUTH DEPOT">South Depot</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              className="hidden h-8 w-56 justify-between gap-2 border-border/70 text-xs text-muted-foreground sm:flex"
              onClick={() => setPaletteOpen(true)}
            >
              <span className="flex items-center gap-2">
                <Search className="size-3.5" />
                Global search…
              </span>
              <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
            </Button>
            <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setPaletteOpen(true)} aria-label="Search">
              <Search className="size-[18px]" />
            </Button>

            <NotificationCenter />
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="lg:pl-[230px]">
        <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </div>
      </main>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
