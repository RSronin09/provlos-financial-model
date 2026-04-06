import { Link, useLocation } from "wouter";
import { LayoutDashboard, MessageSquare, FileText, Settings, Truck, Fuel, CalendarDays } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/monthly", label: "Monthly", icon: CalendarDays },
  { href: "/report", label: "Report", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const { data: gasData } = useQuery({
    queryKey: ["/api/gas-price"],
    queryFn: () => apiRequest("GET", "/api/gas-price").then((r) => r.json()),
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <div className="flex h-screen bg-background" data-testid="app-layout">
      {/* Sidebar */}
      <aside className="w-60 border-r border-border bg-sidebar flex flex-col" data-testid="sidebar">
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
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm cursor-pointer transition-colors",
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}
