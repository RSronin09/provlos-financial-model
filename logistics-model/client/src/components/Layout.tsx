import { Link, useLocation } from "wouter";
import { LayoutDashboard, MessageSquare, FileText, Settings, Truck, Fuel, CalendarDays, Menu, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/monthly", label: "Monthly", icon: CalendarDays },
  { href: "/report", label: "Report", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: gasData } = useQuery({
    queryKey: ["/api/gas-price"],
    queryFn: () => apiRequest("GET", "/api/gas-price").then((r) => r.json()),
    refetchInterval: 5 * 60 * 1000,
  });

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Truck className="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold text-sm text-sidebar-foreground leading-tight">FleetFinance</div>
            <div className="text-xs text-muted-foreground">Logistics Model</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = location === href;
          return (
            <Link key={href} href={href}>
              <div
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm cursor-pointer transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                )}
                data-testid={`nav-${label.toLowerCase()}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Live Gas Price */}
      <div className="p-3 border-t border-sidebar-border" data-testid="gas-price-widget">
        <div className="bg-card rounded-lg p-3 border border-card-border">
          <div className="flex items-center gap-2 mb-1">
            <Fuel className="w-3.5 h-3.5 text-chart-2" />
            <span className="text-xs font-medium text-muted-foreground">Live Gas Price</span>
          </div>
          {gasData ? (
            <>
              <div className="text-lg font-bold text-foreground tabular-nums">
                ${gasData.price?.toFixed(2)}<span className="text-xs font-normal text-muted-foreground">/gal</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">{gasData.state} — Regular</div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Loading...</div>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen bg-background" data-testid="app-layout">

      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside className="hidden md:flex w-60 border-r border-border bg-sidebar flex-col shrink-0" data-testid="sidebar">
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay sidebar ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          {/* Drawer */}
          <aside className="relative z-10 w-64 bg-sidebar flex flex-col h-full shadow-xl">
            <button
              className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-sidebar shrink-0">
          <button
            className="p-1 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <Truck className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm text-sidebar-foreground">FleetFinance</span>
          </div>
          {gasData && (
            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <Fuel className="w-3 h-3 text-chart-2" />
              <span className="font-semibold text-foreground">${gasData.price?.toFixed(2)}</span>
              <span>/gal</span>
            </div>
          )}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex border-t border-border bg-sidebar shrink-0">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href} className="flex-1">
                <div className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-1 text-center cursor-pointer transition-colors",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}>
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] font-medium leading-tight">{label}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
