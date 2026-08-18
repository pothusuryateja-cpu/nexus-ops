import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useWarehouse } from "@/store/warehouse";
import { fmtMoney, stockStatus } from "@/store/engine";
import {
  AlertTriangle,
  Boxes,
  BrainCircuit,
  Gauge,
  Package,
  PackageOpen,
  PersonStanding,
  Settings,
  Truck,
  User,
  Warehouse,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { state } = useWarehouse();
  const [internalOpen, setInternalOpen] = useState(false);
  const navigate = useNavigate();

  const isOpen = open ?? internalOpen;
  const setIsOpen = (o: boolean) => {
    if (onOpenChange) onOpenChange(o);
    else setInternalOpen(o);
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen(!(open ?? internalOpen));
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, internalOpen]);

  const go = (to: string) => {
    setIsOpen(false);
    navigate(to);
  };

  const items = useMemo(() => {
    const q = "";
    const pages = [
      { label: "Command Center", to: "/dashboard", icon: <Gauge className="size-4" /> },
      { label: "Orders", to: "/orders", icon: <Package className="size-4" /> },
      { label: "Inventory", to: "/inventory", icon: <Boxes className="size-4" /> },
      { label: "Allocations", to: "/allocations", icon: <Warehouse className="size-4" /> },
      { label: "Picking", to: "/picking", icon: <PersonStanding className="size-4" /> },
      { label: "Packing & QC", to: "/packing", icon: <PackageOpen className="size-4" /> },
      { label: "Dispatch", to: "/dispatch", icon: <Truck className="size-4" /> },
      { label: "Exceptions", to: "/exceptions", icon: <AlertTriangle className="size-4" /> },
      { label: "Decision Center", to: "/decisions", icon: <BrainCircuit className="size-4" /> },
      { label: "Warehouse Simulator", to: "/simulator", icon: <Warehouse className="size-4" /> },
      { label: "Analytics", to: "/analytics", icon: <Gauge className="size-4" /> },
      { label: "Settings", to: "/settings", icon: <Settings className="size-4" /> },
    ];
    const orders = state.orders.slice(0, 12).map((o) => ({
      label: `${o.id} — ${o.customer}`,
      hint: `${o.stage} · ${fmtMoney(o.value)}`,
      to: `/orders?order=${o.id}`,
      icon: <Package className="size-4" />,
    }));
    const products = state.products.slice(0, 12).map((p) => ({
      label: `${p.sku} — ${p.name}`,
      hint: `${stockStatus(p)} · ${p.available} avail`,
      to: `/inventory?sku=${p.sku}`,
      icon: <Boxes className="size-4" />,
    }));
    const pickers = state.pickers.map((p) => ({
      label: `${p.id} — ${p.name}`,
      hint: p.status,
      to: "/picking",
      icon: <User className="size-4" />,
    }));
    const exceptions = state.exceptions.slice(0, 8).map((e) => ({
      label: `${e.id} — ${e.type}`,
      hint: e.status,
      to: `/exceptions?exception=${e.id}`,
      icon: <AlertTriangle className="size-4" />,
    }));
    const zones = state.zones.map((z) => ({
      label: `Zone ${z.id} — ${z.name}`,
      hint: `capacity ${z.capacity}`,
      to: `/dashboard?zone=${z.id}`,
      icon: <Warehouse className="size-4" />,
    }));
    const missions = state.missions.slice(0, 8).map((m) => ({
      label: `${m.id} — order ${m.orderId}`,
      hint: `${m.status} · ${m.progress}%`,
      to: "/picking",
      icon: <PersonStanding className="size-4" />,
    }));
    return { pages, orders, products, pickers, exceptions, zones, missions, q };
  }, [state]);

  return (
    <CommandDialog open={isOpen} onOpenChange={setIsOpen} title="NEXUS Search">
      <CommandInput placeholder="Search orders, SKUs, pickers, exceptions, zones…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Pages">
          {items.pages.map((p) => (
            <CommandItem key={p.to} onSelect={() => go(p.to)}>
              {p.icon}
              <span>{p.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Orders">
          {items.orders.map((o) => (
            <CommandItem key={o.to} onSelect={() => go(o.to)}>
              {o.icon}
              <span>{o.label}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{o.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Products & SKUs">
          {items.products.map((p) => (
            <CommandItem key={p.to} onSelect={() => go(p.to)}>
              {p.icon}
              <span>{p.label}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{p.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Pickers & Missions">
          {items.pickers.map((p) => (
            <CommandItem key={p.label} onSelect={() => go(p.to)}>
              {p.icon}
              <span>{p.label}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{p.hint}</span>
            </CommandItem>
          ))}
          {items.missions.map((m) => (
            <CommandItem key={m.label} onSelect={() => go(m.to)}>
              <PersonStanding className="size-4" />
              <span>{m.label}</span>
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">{m.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Exceptions">
          {items.exceptions.map((e) => (
            <CommandItem key={e.to} onSelect={() => go(e.to)}>
              {e.icon}
              <span>{e.label}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{e.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Zones">
          {items.zones.map((z) => (
            <CommandItem key={z.to} onSelect={() => go(z.to)}>
              {z.icon}
              <span>{z.label}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{z.hint}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
