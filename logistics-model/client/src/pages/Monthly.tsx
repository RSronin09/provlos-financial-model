import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Target, Activity } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const MONTH_LABELS = Array.from({ length: 12 }, (_, i) => `M${i + 1}`);

const SCENARIO_COLORS: Record<string, string> = {
  "Best Case":  "hsl(160, 50%, 42%)",
  "Base Case":  "hsl(215, 60%, 40%)",
  "Worst Case": "hsl(350, 55%, 48%)",
};

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtK = (n: number) => `$${(n / 1000).toFixed(0)}k`;

const thSticky = "sticky left-0 z-10 bg-muted/80 text-left px-4 py-3 font-semibold whitespace-nowrap";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-base font-semibold text-foreground border-b border-border pb-2 mb-4">
      {children}
    </h2>
  );
}

// Section header row (e.g. "REVENUE", "COST OF REVENUE")
function SectionHeaderRow({ label, colCount }: { label: string; colCount: number }) {
  return (
    <tr className="bg-muted/50 border-t-2 border-border">
      <td className="sticky left-0 z-10 bg-muted/50 px-4 py-1.5">
        <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">{label}</span>
      </td>
      {Array.from({ length: colCount - 1 }).map((_, i) => (
        <td key={i} className="px-3 py-1.5 bg-muted/50" />
      ))}
    </tr>
  );
}

// Subtotal row (e.g. Gross Profit, Operating Income) — bold, double top border
function SubtotalRow({ label, values, total }: { label: string; values: number[]; total: number }) {
  const color = (v: number) => v >= 0 ? "text-foreground" : "text-destructive";
  return (
    <tr className="border-t-2 border-border bg-muted/20">
      <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2 font-bold whitespace-nowrap">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-3 py-2 text-right tabular-nums font-bold ${color(v)}`}>{fmt(v)}</td>
      ))}
      <td className={`px-4 py-2 text-right tabular-nums font-bold bg-muted/40 ${color(total)}`}>{fmt(total)}</td>
    </tr>
  );
}

// Margin % row — italic, muted, no currency
function MarginRow({ label, values, total, highlight = false }: { label: string; values: number[]; total: number; highlight?: boolean }) {
  const color = (v: number) => v >= 0 ? (highlight ? "text-chart-3 font-semibold" : "text-muted-foreground") : "text-destructive";
  return (
    <tr className={`border-b border-border/30 ${highlight ? "bg-primary/5" : ""}`}>
      <td className={`sticky left-0 z-10 px-4 py-1.5 text-xs italic whitespace-nowrap ${
        highlight ? "bg-primary/5 font-semibold" : "bg-background text-muted-foreground"
      }`}>{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`px-3 py-1.5 text-right tabular-nums text-xs italic ${color(v)}`}>
          {v.toFixed(1)}%
        </td>
      ))}
      <td className={`px-4 py-1.5 text-right tabular-nums text-xs italic font-semibold ${
        highlight ? "bg-primary/10" : "bg-muted/20"
      } ${color(total)}`}>
        {total.toFixed(1)}%
      </td>
    </tr>
  );
}

// Expandable parent row + child rows
function ExpandableRows({
  label,
  values,
  total,
  labelClassName = "",
  valueClassName = "",
  children,
  isProfit = false,
  separatorTop = false,
}: {
  label: string;
  values: number[];
  total: number;
  labelClassName?: string;
  valueClassName?: string;
  children?: React.ReactNode; // child <tr> elements
  isProfit?: boolean;
  separatorTop?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = !!children;

  const profitColor = (v: number) => v >= 0 ? "text-chart-3 font-semibold" : "text-destructive font-semibold";

  return (
    <>
      <tr
        className={`border-t border-border ${separatorTop ? "border-t-2" : ""} ${hasChildren ? "cursor-pointer hover:bg-muted/30" : ""} transition-colors`}
        onClick={hasChildren ? () => setOpen((o) => !o) : undefined}
        data-testid={`row-${label.toLowerCase().replace(/\s+/g, "-")}`}
      >
        {/* Sticky label cell */}
        <td className="sticky left-0 z-10 bg-background px-4 py-2.5 font-medium whitespace-nowrap">
          <span className={`flex items-center gap-1.5 ${labelClassName}`}>
            {hasChildren && (
              <ChevronRight
                className={`w-3.5 h-3.5 flex-shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
              />
            )}
            {label}
          </span>
        </td>
        {/* Value cells */}
        {values.map((val, i) => (
          <td
            key={i}
            className={`px-3 py-2.5 text-right tabular-nums ${isProfit ? profitColor(val) : valueClassName}`}
          >
            {fmt(val)}
          </td>
        ))}
        {/* Annual total */}
        <td className={`px-4 py-2.5 text-right tabular-nums font-semibold bg-muted/20 ${isProfit ? profitColor(total) : valueClassName}`}>
          {fmt(total)}
        </td>
      </tr>

      {/* Child rows — slide in when open */}
      {open && children}
    </>
  );
}

// Simple non-expandable child row (indented)
function ChildRow({
  label,
  values,
  total,
  labelClassName = "",
  valueClassName = "",
}: {
  label: string;
  values: number[];
  total: number;
  labelClassName?: string;
  valueClassName?: string;
}) {
  return (
    <tr className="border-t border-border/50 bg-muted/10" data-testid={`child-row-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <td className="sticky left-0 z-10 bg-muted/10 px-4 py-2 whitespace-nowrap">
        <span className={`flex items-center gap-1.5 pl-5 text-xs text-muted-foreground ${labelClassName}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
          {label}
        </span>
      </td>
      {values.map((val, i) => (
        <td key={i} className={`px-3 py-2 text-right tabular-nums text-xs text-muted-foreground ${valueClassName}`}>
          {fmt(val)}
        </td>
      ))}
      <td className={`px-4 py-2 text-right tabular-nums text-xs font-medium bg-muted/20 text-muted-foreground ${valueClassName}`}>
        {fmt(total)}
      </td>
    </tr>
  );
}

export default function Monthly() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/financial-summary"],
    queryFn: () => apiRequest("GET", "/api/financial-summary").then((r) => r.json()),
    refetchInterval: 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 rounded-lg" />
        ))}
      </div>
    );
  }

  const { expenses, scenarioProjections, settings, profitability, revenueModel, driverTimeline } = data;
  const fleetByMonth: number[] = driverTimeline?.fleetByMonth ?? Array(12).fill(settings?.fleetSize ?? 1);
  const milestones: any[] = driverTimeline?.milestones ?? [];
  const autoDriverCount: number = driverTimeline?.autoDriverCount ?? 1;
  const isRampActive: boolean = driverTimeline?.isRampActive ?? false;
  const totalMilesFromTimeline: number = driverTimeline?.totalMilesPerMonth ?? 0;
  const milesByMonth: number[] = driverTimeline?.milesByMonth ?? Array(12).fill(totalMilesFromTimeline);
  const driversByMonth: number[] = driverTimeline?.driversByMonth ?? Array(12).fill(autoDriverCount);
  const rampMonthIndices: number[] = driverTimeline?.rampMonthIndices ?? [];
  const milesIncrement: number = driverTimeline?.milesIncrement ?? 0;
  // Base Case monthly data (includes weeklyBreakdown per month)
  const baseMonths: any[] = scenarioProjections?.find((s: any) => s.name === "Base Case")?.months ?? [];
  const fixedExpenses: any[] = expenses.fixed ?? [];
  const variableExpenses: any[] = expenses.variable ?? [];
  const totalFixed: number = expenses.totalFixed;
  const totalVariable: number = expenses.totalVariable;
  const monthlyFuelCost: number = expenses.monthlyFuelCost;
  const totalMilesPerMonth: number = expenses.totalMilesPerMonth ?? 0;
  const growthRate: number = settings.revenueGrowthRate;
  const gallonsPerMonth: number = data.fuelCost?.gallonsPerMonth ?? 0;
  const costPerGallon: number = data.fuelCost?.costPerGallon ?? 0;
  const gasPriceSource: string = data.gasPriceSource ?? "";

  const baseScenario = scenarioProjections?.find((s: any) => s.name === "Base Case");
  const plRows: any[] = baseScenario?.months ?? [];

  // Annual totals
  const totals = plRows.reduce(
    (acc: any, m: any) => ({
      revenue: acc.revenue + m.revenue,
      fixed: acc.fixed + totalFixed,
      variable: acc.variable + totalVariable,
      fuel: acc.fuel + m.fuelCost,
      totalExpenses: acc.totalExpenses + m.expenses,
      netProfit: acc.netProfit + m.profit,
    }),
    { revenue: 0, fixed: 0, variable: 0, fuel: 0, totalExpenses: 0, netProfit: 0 }
  );

  // Chart data
  const scenarioChartData = MONTH_LABELS.map((label, i) => {
    const row: Record<string, any> = { month: label };
    scenarioProjections?.forEach((s: any) => { row[s.name] = s.months[i]?.profit ?? 0; });
    return row;
  });

  const revenueChartData = MONTH_LABELS.map((label, i) => {
    const row: Record<string, any> = { month: label };
    scenarioProjections?.forEach((s: any) => { row[s.name] = s.months[i]?.revenue ?? 0; });
    return row;
  });

  const expenseDetailData = MONTH_LABELS.map((label, i) => {
    const monthGrowth = Math.pow(1 + growthRate / 12, i + 1);
    return {
      month: label,
      Fixed: Math.round(totalFixed),
      Variable: Math.round(totalVariable * monthGrowth),
      Fuel: Math.round(monthlyFuelCost),
    };
  });

  // Per-expense monthly values (fixed = flat, variable = flat for now)
  const fixedChildRows = fixedExpenses.map((exp) => ({
    label: exp.name,
    values: MONTH_LABELS.map(() => exp.amount),
    total: exp.amount * 12,
  }));

  const variableChildRows = variableExpenses.map((exp) => {
    const amt = exp.computedAmount ?? exp.amount;
    return {
      label: exp.ratePerMile ? `${exp.name} ($${exp.ratePerMile}/mi)` : exp.name,
      values: MONTH_LABELS.map(() => amt),
      total: amt * 12,
    };
  });

  const fuelChildRows = [
    {
      label: `Gallons/month: ${Math.round(gallonsPerMonth)}`,
      values: MONTH_LABELS.map(() => gallonsPerMonth),
      total: gallonsPerMonth * 12,
      isGallons: true,
    },
    {
      label: `Price/gal: $${costPerGallon.toFixed(3)} (${gasPriceSource})`,
      values: MONTH_LABELS.map(() => costPerGallon),
      total: costPerGallon,
      isRate: true,
    },
  ];

  // Expense section child rows (for the expense detail table)
  const expFixedChildren = fixedExpenses.map((exp) => ({
    label: exp.name,
    values: MONTH_LABELS.map(() => exp.amount),
    total: exp.amount * 12,
  }));

  const expVariableChildren = variableExpenses.map((exp) => {
    const amt = exp.computedAmount ?? exp.amount;
    return {
      label: exp.ratePerMile ? `${exp.name} ($${exp.ratePerMile}/mi)` : exp.name,
      values: MONTH_LABELS.map(() => amt),
      total: amt * 12,
    };
  });

  return (
    <div className="p-6 space-y-8" data-testid="monthly-page">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Monthly Breakdown</h1>
        <p className="text-sm text-muted-foreground">
          {settings.businessName} — {settings.fleetSize} truck{settings.fleetSize !== 1 ? "s" : ""}, {settings.state} · Base Case with {(growthRate * 100).toFixed(0)}% annual growth · Click any row to expand
        </p>
      </div>

      {/* ── SECTION 1: P&L Table ── */}
      <section data-testid="section-pl-table">
        <SectionTitle>Full 12-Month Profit &amp; Loss Statement (Base Case)</SectionTitle>
        {/* Miles & driver banner */}
        <div className="mb-3 p-3 rounded-lg border bg-primary/5 border-primary/20 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-primary">
              {milesIncrement !== 0
                ? `Miles grow ${totalMilesFromTimeline.toLocaleString()} → ${(totalMilesFromTimeline + milesIncrement * 11).toLocaleString()} mi/mo (+${milesIncrement.toLocaleString()}/mo)`
                : `${totalMilesFromTimeline.toLocaleString()} mi/mo (flat) → ${autoDriverCount} driver${autoDriverCount !== 1 ? "s" : ""}`
              }
            </span>
            {isRampActive && (
              <span className="text-amber-600 font-medium">
                Ramp months: {rampMonthIndices.map(i => `M${i+1}`).join(', ')} — 10% → 25% → 65% → 100%
              </span>
            )}
          </div>
          {/* Per-month miles + driver row */}
          <div className="flex gap-1">
            {milesByMonth.map((miles, i) => {
              const drivers = driversByMonth[i];
              const isRamp = rampMonthIndices.includes(i);
              const prevDrivers = i === 0 ? 1 : driversByMonth[i-1];
              const driverChange = drivers > prevDrivers;
              return (
                <div key={i} className={`flex-1 text-center rounded py-1 ${
                  isRamp ? 'bg-amber-500/15 border border-amber-500/30' :
                  driverChange ? 'bg-primary/20' :
                  'bg-muted/30'
                }`}>
                  <p className={`text-[8px] font-bold ${
                    isRamp ? 'text-amber-600' : driverChange ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {drivers}drv{isRamp ? '⇑' : ''}
                  </p>
                  <p className="text-[8px] text-muted-foreground">{(miles/1000).toFixed(0)}k</p>
                  <p className="text-[7px] text-muted-foreground">M{i+1}</p>
                </div>
              );
            })}
          </div>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="text-xs w-max min-w-full" data-testid="pl-table">
                <thead>
                  {/* Fleet size indicator row */}
                  <tr className="bg-primary/5 border-b border-primary/20">
                    <td className={`${thSticky} text-[10px] text-primary font-semibold py-1`} style={{ minWidth: 220 }}>
                      Fleet Size
                    </td>
                    {fleetByMonth.map((fleet, i) => {
                      const isMilestone = milestones.some((m: any) => m.startMonth === i + 1);
                      const milestone = milestones.find((m: any) => m.startMonth === i + 1);
                      return (
                        <td key={i} className={`px-3 py-1 text-center whitespace-nowrap ${
                          isMilestone ? "bg-primary/15" : ""
                        }`}>
                          <span className={`text-[10px] font-bold ${
                            isMilestone ? "text-primary" : "text-muted-foreground"
                          }`}>{fleet} {isMilestone ? "🚗" : ""}</span>
                          {isMilestone && milestone?.note && (
                            <div className="text-[9px] text-primary/70 leading-tight">{milestone.note}</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-1 text-center text-[10px] text-muted-foreground bg-muted/20">—</td>
                  </tr>
                  <tr className="bg-muted/80 text-muted-foreground border-b-2 border-border">
                    <th className={thSticky} style={{ minWidth: 220 }}>Line Item</th>
                    {MONTH_LABELS.map((m, i) => {
                      const isMilestone = milestones.some((ms: any) => ms.startMonth === i + 1);
                      return (
                        <th key={m} className={`text-right px-3 py-3 font-semibold whitespace-nowrap ${
                          isMilestone ? "border-l-2 border-primary/40" : ""
                        }`}>{m}</th>
                      );
                    })}
                    <th className="text-right px-4 py-3 font-semibold whitespace-nowrap bg-muted/80">Annual</th>
                  </tr>
                </thead>
                <tbody>

                  {/* ── REVENUE ── */}
                  <SectionHeaderRow label="REVENUE" colCount={14} />
                  <ExpandableRows
                    label="Gross Revenue"
                    values={plRows.map((m: any) => m.revenue)}
                    total={totals.revenue}
                    valueClassName="text-chart-3 font-semibold"
                    labelClassName="font-semibold"
                  >
                    {revenueModel?.jobTypeBreakdown?.map((jt: any) => {
                      // Each job type's revenue scales with fleet size at each month
                      const monthlyValues = fleetByMonth.map((fleet) => jt.revenuePerDriver * fleet);
                      const annualTotal = monthlyValues.reduce((s: number, v: number) => s + v, 0);
                      return (
                        <ChildRow
                          key={jt.id}
                          label={`${jt.name} — ${jt.runsPerDriverPerMonth ?? jt.runsPerMonth} run${jt.runsPerDriverPerMonth !== 1 ? "s" : ""}/driver × ${jt.avgMilesPerRun} mi @ $${jt.totalRatePerMile}/mi`}
                          values={monthlyValues}
                          total={annualTotal}
                        />
                      );
                    })}
                  </ExpandableRows>

                  {/* ── COST OF REVENUE (direct costs that scale with operations) ── */}
                  <SectionHeaderRow label="COST OF REVENUE" colCount={14} />
                  <ExpandableRows
                    label="Variable Operating Costs"
                    values={plRows.map((m: any, i: number) => totalVariable * fleetByMonth[i])}
                    total={fleetByMonth.reduce((s, f) => s + totalVariable * f, 0)}
                    valueClassName="text-muted-foreground"
                  >
                    {variableExpenses.map((exp: any) => {
                      const amt = exp.computedAmount ?? exp.amount;
                      const vals = fleetByMonth.map((fleet) => amt * fleet);
                      return (
                        <ChildRow
                          key={exp.id}
                          label={exp.ratePerMile ? `${exp.name} ($${exp.ratePerMile}/mi × fleet)` : exp.name}
                          values={vals}
                          total={vals.reduce((s: number, v: number) => s + v, 0)}
                        />
                      );
                    })}
                  </ExpandableRows>
                  <ExpandableRows
                    label={`Fuel — Regular Gasoline (${gasPriceSource})`}
                    values={plRows.map((m: any) => m.fuelCost)}
                    total={totals.fuel}
                    valueClassName="text-muted-foreground"
                  >
                    <ChildRow
                      label={`${Math.round(gallonsPerMonth)} gal/driver/mo × $${costPerGallon.toFixed(3)}/gal × fleet`}
                      values={fleetByMonth.map((fleet) => monthlyFuelCost * fleet)}
                      total={fleetByMonth.reduce((s, f) => s + monthlyFuelCost * f, 0)}
                    />
                  </ExpandableRows>
                  {/* Gross Profit = Revenue - Variable - Fuel (all fleet-scaled via plRows) */}
                  <SubtotalRow
                    label="Gross Profit"
                    values={plRows.map((m: any, i: number) => {
                      const fleet = fleetByMonth[i] ?? 1;
                      return m.revenue - (totalVariable * fleet) - m.fuelCost;
                    })}
                    total={fleetByMonth.reduce((s, fleet, i) =>
                      s + (plRows[i]?.revenue ?? 0) - (totalVariable * fleet) - (plRows[i]?.fuelCost ?? 0), 0)}
                  />
                  <MarginRow
                    label="Gross Margin %"
                    values={plRows.map((m: any, i: number) => {
                      const fleet = fleetByMonth[i] ?? 1;
                      const gp = m.revenue - (totalVariable * fleet) - m.fuelCost;
                      return m.revenue > 0 ? (gp / m.revenue) * 100 : 0;
                    })}
                    total={(() => {
                      const totalRev = plRows.reduce((s: number, m: any) => s + m.revenue, 0);
                      const totalGP = fleetByMonth.reduce((s, fleet, i) =>
                        s + (plRows[i]?.revenue ?? 0) - (totalVariable * fleet) - (plRows[i]?.fuelCost ?? 0), 0);
                      return totalRev > 0 ? (totalGP / totalRev) * 100 : 0;
                    })()}
                  />

                  {/* ── OPERATING EXPENSES (fixed overhead) ── */}
                  <SectionHeaderRow label="OPERATING EXPENSES" colCount={14} />
                  <ExpandableRows
                    label="Fixed Overhead"
                    values={plRows.map((m: any, i: number) => {
                      const fleet = fleetByMonth[i];
                      return fixedExpenses.reduce((s: number, e: any) =>
                        s + (e.scalesWithFleet ? e.amount * fleet : e.amount), 0);
                    })}
                    total={fleetByMonth.reduce((s, fleet) =>
                      s + fixedExpenses.reduce((fs: number, e: any) =>
                        fs + (e.scalesWithFleet ? e.amount * fleet : e.amount), 0), 0)}
                    valueClassName="text-muted-foreground"
                  >
                    {fixedExpenses.map((exp: any) => {
                      const vals = fleetByMonth.map((fleet) =>
                        exp.scalesWithFleet ? exp.amount * fleet : exp.amount);
                      return (
                        <ChildRow
                          key={exp.id}
                          label={exp.scalesWithFleet ? `${exp.name} (× fleet)` : `${exp.name} (flat overhead)`}
                          values={vals}
                          total={vals.reduce((s: number, v: number) => s + v, 0)}
                        />
                      );
                    })}
                  </ExpandableRows>
                  {/* Vehicle Lease — scales with active fleet */}
                  <ExpandableRows
                    label="Vehicle Lease Payments"
                    values={plRows.map((m: any) => m.leasePayment ?? 0)}
                    total={plRows.reduce((s: number, m: any) => s + (m.leasePayment ?? 0), 0)}
                    valueClassName="text-muted-foreground"
                  >
                    <ChildRow
                      label="Monthly lease × active trucks (scales with fleet)"
                      values={plRows.map((m: any, i: number) => m.leasePayment ?? 0)}
                      total={plRows.reduce((s: number, m: any) => s + (m.leasePayment ?? 0), 0)}
                    />
                  </ExpandableRows>

                  {/* Operating Income (EBIT) — after all operating costs, before capex */}
                  <SubtotalRow
                    label="Operating Income (EBIT)"
                    values={plRows.map((m: any) => m.ebit ?? m.profit)}
                    total={plRows.reduce((s: number, m: any) => s + (m.ebit ?? m.profit), 0)}
                  />
                  <MarginRow
                    label="Operating Margin %"
                    values={plRows.map((m: any) => m.revenue > 0 ? ((m.ebit ?? m.profit) / m.revenue) * 100 : 0)}
                    total={(() => {
                      const rev = plRows.reduce((s: number, m: any) => s + m.revenue, 0);
                      const ebit = plRows.reduce((s: number, m: any) => s + (m.ebit ?? m.profit), 0);
                      return rev > 0 ? (ebit / rev) * 100 : 0;
                    })()}
                  />

                  {/* ── NET INCOME ── */}
                  <SectionHeaderRow label="NET INCOME" colCount={14} />
                  {/* Vehicle Down Payments — one-time capex when new trucks acquired */}
                  <ExpandableRows
                    label="Vehicle Down Payments (Capital)"
                    values={plRows.map((m: any) => m.downPayment ?? 0)}
                    total={plRows.reduce((s: number, m: any) => s + (m.downPayment ?? 0), 0)}
                    valueClassName="text-muted-foreground"
                  >
                    <ChildRow
                      label="Down payment × new vehicles acquired (one-time per acquisition month)"
                      values={plRows.map((m: any) => m.downPayment ?? 0)}
                      total={plRows.reduce((s: number, m: any) => s + (m.downPayment ?? 0), 0)}
                    />
                  </ExpandableRows>
                  <ExpandableRows
                    label="Total Expenses"
                    values={plRows.map((m: any) => m.expenses)}
                    total={totals.totalExpenses}
                    valueClassName="text-muted-foreground"
                    separatorTop
                  />
                  <ExpandableRows
                    label="Net Profit"
                    values={plRows.map((m: any) => m.profit)}
                    total={totals.netProfit}
                    isProfit
                    separatorTop
                  />
                  <MarginRow
                    label="Net Profit Margin %"
                    values={plRows.map((m: any) => m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0)}
                    total={totals.revenue > 0 ? (totals.netProfit / totals.revenue) * 100 : 0}
                    highlight
                  />

                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── SECTION 1b: WEEKLY BREAKDOWN ── */}
      <section data-testid="section-weekly">
        <SectionTitle>Weekly Breakdown — All 12 Months (Base Case)</SectionTitle>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="text-xs w-max min-w-full" data-testid="weekly-table">
                <thead>
                  <tr className="bg-muted/80 text-muted-foreground border-b-2 border-border">
                    <th className={thSticky} style={{ minWidth: 80 }}>Month</th>
                    <th className="text-center px-3 py-2 whitespace-nowrap font-semibold">Week</th>
                    <th className="text-center px-3 py-2 whitespace-nowrap font-semibold">Miles/Wk</th>
                    <th className="text-center px-3 py-2 whitespace-nowrap font-semibold">Drivers</th>
                    <th className="text-center px-3 py-2 whitespace-nowrap font-semibold">Capacity</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Revenue</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Fuel</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Variable</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Fixed</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Total Exp</th>
                    <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Net Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {baseMonths.map((month: any, mi: number) => {
                    const weeks: any[] = month.weeklyBreakdown ?? [];
                    const monthTotal = {
                      revenue: weeks.reduce((s, w) => s + w.revenue, 0),
                      expenses: weeks.reduce((s, w) => s + w.expenses, 0),
                      profit: weeks.reduce((s, w) => s + w.profit, 0),
                      fuel: weeks.reduce((s, w) => s + w.fuel, 0),
                    };
                    return weeks.map((week: any, wi: number) => {
                      const isLastWeek = wi === weeks.length - 1;
                      const isRampMonth = month.isRampMonth;
                      return (
                        <React.Fragment key={`${mi}-${wi}`}>
                          <tr key={`${mi}-${wi}`}
                            className={`border-b border-border/20 ${
                              isRampMonth ? (wi === 3 ? 'bg-chart-3/5' : 'bg-amber-500/5') : mi % 2 === 0 ? 'bg-muted/10' : ''
                            }`}>
                            {wi === 0 && (
                              <td rowSpan={4}
                                className={`sticky left-0 z-10 px-3 py-2 font-bold text-center border-r border-border/30 ${
                                  mi % 2 === 0 ? 'bg-muted/20' : 'bg-background'
                                }`}>
                                M{mi + 1}
                                {isRampMonth && (
                                  <div className="text-[8px] text-amber-600 font-semibold mt-0.5">⇑ RAMP</div>
                                )}
                              </td>
                            )}
                            <td className="px-3 py-1.5 text-center font-medium">Wk {week.week}</td>
                            <td className="px-3 py-1.5 text-center tabular-nums text-muted-foreground">
                              {week.miles?.toLocaleString() ?? '—'}
                            </td>
                            <td className="px-3 py-1.5 text-center tabular-nums">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                isRampMonth && wi < 3 ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'
                              }`}>
                                {week.driverCapacity}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-center tabular-nums">
                              <span className={`text-[10px] font-semibold ${
                                week.rampPct < 100 ? 'text-amber-600' : 'text-chart-3'
                              }`}>{week.rampPct}%</span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-chart-3 font-medium">{fmt(week.revenue)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(week.fuel)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(week.variable)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(week.fixed)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">({fmt(week.expenses)})</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${
                              week.profit >= 0 ? 'text-chart-3' : 'text-destructive'
                            }`}>{fmt(week.profit)}</td>
                          </tr>
                          {isLastWeek && (
                            <tr className="bg-muted/40 border-b-2 border-border font-semibold text-xs">
                              <td className="sticky left-0 z-10 bg-muted/40 px-3 py-1.5 text-center border-r border-border/30 text-[10px] text-muted-foreground">—</td>
                              <td className="px-3 py-1.5 text-center text-[10px] text-muted-foreground" colSpan={2}>M{mi+1} Total</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-chart-3">{fmt(monthTotal.revenue)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{fmt(monthTotal.fuel)}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground"></td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground"></td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">({fmt(monthTotal.expenses)})</td>
                              <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${
                                monthTotal.profit >= 0 ? 'text-chart-3' : 'text-destructive'
                              }`}>{fmt(monthTotal.profit)}</td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── SECTION 1b: BEP & FCCR Summary Cards ── */}
      <section data-testid="section-bep-fccr">
        <SectionTitle>Break-Even &amp; Coverage Metrics</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

          {/* BEP Card */}
          <Card data-testid="monthly-bep-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Target className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Break-Even Point (BEP)</p>
                  <p className="text-[11px] text-muted-foreground">(Fixed + Variable) ÷ Total Miles — min rate/mile to cover ALL costs</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                {/* PRIMARY: BEP rate/mile */}
                <div className="p-2.5 bg-primary/5 rounded-lg border border-primary/20 col-span-2">
                  <p className="text-xs text-muted-foreground">BEP Rate / Mile</p>
                  <p className="text-xl font-bold tabular-nums mt-0.5 text-primary">
                    ${(profitability?.breakEvenRatePerMile ?? 0).toFixed(2)}/mile
                  </p>
                  <p className={`text-xs font-semibold mt-1 ${
                    (profitability?.revenuePerMile ?? 0) >= (profitability?.breakEvenRatePerMile ?? 0)
                      ? "text-chart-3" : "text-destructive"
                  }`}>
                    {(profitability?.revenuePerMile ?? 0) >= (profitability?.breakEvenRatePerMile ?? 0)
                      ? `✓ Actual rate $${(profitability?.revenuePerMile ?? 0).toFixed(2)}/mi is +$${(profitability?.surplusRatePerMile ?? 0).toFixed(2)}/mi above BEP`
                      : `✗ Actual rate $${(profitability?.revenuePerMile ?? 0).toFixed(2)}/mi is $${Math.abs(profitability?.surplusRatePerMile ?? 0).toFixed(2)}/mi below BEP`}
                  </p>
                </div>
                <div className="p-2.5 bg-muted/40 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground">BEP Revenue / Month</p>
                  <p className="text-sm font-bold tabular-nums mt-0.5">${(profitability?.breakEvenRevenue ?? 0).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">= total cost to cover</p>
                </div>
                <div className="p-2.5 bg-muted/40 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground">Fixed / Variable</p>
                  <p className="text-sm font-bold tabular-nums mt-0.5">${totalFixed.toLocaleString()} / ${(totalVariable + monthlyFuelCost).toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">fixed / variable per month</p>
                </div>
              </div>
              {/* Rate/mile progress bar */}
              <div className="relative h-3 bg-muted rounded-full overflow-hidden">
                <div className="absolute top-0 h-full w-0.5 bg-foreground/50 z-10"
                  style={{ left: `${Math.min(((profitability?.breakEvenRatePerMile ?? 0) / (Math.max(profitability?.revenuePerMile ?? 0, profitability?.breakEvenRatePerMile ?? 0) * 1.25)) * 100, 100)}%` }}
                />
                <div className={`h-full rounded-full ${
                    (profitability?.revenuePerMile ?? 0) >= (profitability?.breakEvenRatePerMile ?? 0) ? "bg-chart-3" : "bg-destructive"
                  }`}
                  style={{ width: `${Math.min(((profitability?.revenuePerMile ?? 0) / (Math.max(profitability?.revenuePerMile ?? 0, profitability?.breakEvenRatePerMile ?? 0) * 1.25)) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>$0/mi</span>
                <span>BEP: ${(profitability?.breakEvenRatePerMile ?? 0).toFixed(2)}/mi</span>
                <span>Actual: ${(profitability?.revenuePerMile ?? 0).toFixed(2)}/mi</span>
              </div>
              <p className="text-[10px] text-muted-foreground font-mono mt-1.5">
                BEP = (${totalFixed.toLocaleString()} + ${(totalVariable + monthlyFuelCost).toLocaleString()}) ÷ {totalMilesPerMonth.toLocaleString()} mi
              </p>
            </CardContent>
          </Card>

          {/* FCCR Card */}
          <Card data-testid="monthly-fccr-card">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Activity className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Fixed Charge Coverage Ratio (FCCR)</p>
                  <p className="text-[11px] text-muted-foreground">Revenue ÷ Total Expenses — measures ability to cover all fixed charges with operating income</p>
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-3">
                <p className={`text-3xl font-bold tabular-nums ${
                  (profitability?.fccr ?? 0) >= 1.25 ? "text-chart-3" :
                  (profitability?.fccr ?? 0) >= 1.20 ? "text-amber-600" : "text-destructive"
                }`}>{(profitability?.fccr ?? 0).toFixed(2)}x</p>
                <p className={`text-sm font-semibold ${
                  (profitability?.fccr ?? 0) >= 1.25 ? "text-chart-3" :
                  (profitability?.fccr ?? 0) >= 1.20 ? "text-amber-600" : "text-destructive"
                }`}>
                  {(profitability?.fccr ?? 0) >= 1.25 ? "Exceeds threshold" :
                   (profitability?.fccr ?? 0) >= 1.20 ? "Meets minimum" : "Below threshold"}
                </p>
              </div>
              <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-1">
                <div className="absolute top-0 h-full w-px bg-destructive/60" style={{ left: `${(1.0/3.0)*100}%` }} />
                <div className="absolute top-0 h-full w-px bg-amber-500/60" style={{ left: `${(1.20/3.0)*100}%` }} />
                <div className="absolute top-0 h-full w-px bg-chart-3/60" style={{ left: `${(1.25/3.0)*100}%` }} />
                <div
                  className={`h-full rounded-full ${
                    (profitability?.fccr ?? 0) >= 1.25 ? "bg-chart-3" :
                    (profitability?.fccr ?? 0) >= 1.20 ? "bg-amber-500" : "bg-destructive"
                  }`}
                  style={{ width: `${Math.min(((profitability?.fccr ?? 0)/3.0)*100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1.0x min</span><span>1.20x</span><span>1.25x+ excellent</span>
              </div>
              <div className="mt-3 p-2.5 bg-muted/30 rounded border border-border">
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Formula:</span> Revenue ÷ Total Expenses ={" "}
                  ${(profitability?.monthlyRevenue ?? 0).toLocaleString()} ÷ ${(profitability?.totalExpenses ?? 0).toLocaleString()} = {(profitability?.fccr ?? 0).toFixed(2)}x
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Most lenders require a minimum FCCR of 1.20x–1.25x to approve financing.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── CASH FLOW SECTION ── */}
      <section data-testid="section-cash-flow">
        <SectionTitle>Monthly Cash Flow Statement (Base Case)</SectionTitle>
        <Card>
          <CardContent className="p-4">
            {(() => {
              let cumSum = 0;
              const cfRows = plRows.map((m: any) => {
                const operatingCF = m.ebit ?? m.profit;
                const capex       = m.downPayment ?? 0;
                const freeCF      = m.profit ?? 0;
                cumSum += freeCF;
                return { month: m.month, miles: m.miles ?? 0, drivers: m.drivers ?? 1, operatingCF, capex, freeCF, cumulative: cumSum };
              });
              const cfChartData = cfRows.map(r => ({
                month: `M${r.month}`,
                'Op. CF': r.operatingCF,
                'Free CF': r.freeCF,
                'CapEx': r.capex,
                Cumulative: r.cumulative,
              }));
              const totalOpCF   = cfRows.reduce((s, r) => s + r.operatingCF, 0);
              const totalCapex  = cfRows.reduce((s, r) => s + r.capex, 0);
              const totalFreeCF = cfRows.reduce((s, r) => s + r.freeCF, 0);

              return (
                <>
                  {/* KPI summary row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                    {[
                      { label: "Total Operating CF",    value: fmt(totalOpCF),                      note: "12-mo EBIT sum",      hi: true  },
                      { label: "Total Capital Exp.",    value: totalCapex > 0 ? `(${fmt(totalCapex)})` : "$0", note: "Vehicle acquisitions", hi: false },
                      { label: "Total Free Cash Flow",  value: fmt(totalFreeCF),                    note: "Op. CF − CapEx",      hi: true  },
                      { label: "Year-End Position",     value: fmt(cfRows[11]?.cumulative ?? 0),    note: "Cumulative from M1", hi: (cfRows[11]?.cumulative ?? 0) >= 0 },
                    ].map((t: any) => (
                      <div key={t.label} className={`p-3 rounded-lg border ${t.hi ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"}`}>
                        <p className="text-xs text-muted-foreground">{t.label}</p>
                        <p className={`text-sm font-bold tabular-nums mt-0.5 ${t.hi ? "text-primary" : ""}`}>{t.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.note}</p>
                      </div>
                    ))}
                  </div>

                  {/* Charts side by side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Monthly Free Cash Flow</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={cfChartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                          <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={fmtK} />
                          <Tooltip formatter={(v: number) => fmt(v)} />
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                          <Bar dataKey="Free CF" fill="hsl(160,50%,42%)" radius={[3,3,0,0]} />
                          <Bar dataKey="CapEx"   fill="hsl(34,80%,50%)"  radius={[3,3,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-2">Cumulative Cash Position</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={cfChartData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                          <XAxis dataKey="month" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 9 }} tickFormatter={fmtK} />
                          <Tooltip formatter={(v: number) => fmt(v)} />
                          <Line dataKey="Cumulative" stroke="hsl(215,60%,40%)" strokeWidth={2.5} dot={{ r: 3 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="text-xs w-full" data-testid="cash-flow-table">
                      <thead>
                        <tr className="bg-muted/80 text-muted-foreground border-b-2 border-border">
                          <th className={thSticky} style={{ minWidth: 80 }}>Month</th>
                          <th className="text-center px-3 py-2 whitespace-nowrap font-semibold">Drivers</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Miles</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Op. Cash Flow</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Capital Exp.</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Free Cash Flow</th>
                          <th className="text-right px-3 py-2 whitespace-nowrap font-semibold">Cumulative</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cfRows.map((r, i) => (
                          <tr key={i} className={`border-b border-border/20 ${
                            r.capex > 0 ? "bg-amber-500/5" : i % 2 === 0 ? "bg-muted/10" : ""
                          }`}>
                            <td className={`sticky left-0 z-10 px-3 py-2 font-bold border-r border-border/30 ${
                              i % 2 === 0 ? "bg-muted/20" : "bg-background"
                            }`}>
                              M{r.month}
                              {r.capex > 0 && <span className="ml-1 text-[9px] bg-amber-500/20 text-amber-700 px-1 py-0.5 rounded">+TRUCK</span>}
                            </td>
                            <td className="px-3 py-1.5 text-center tabular-nums">{r.drivers}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{r.miles.toLocaleString()}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${
                              r.operatingCF >= 0 ? "text-chart-3" : "text-destructive"
                            }`}>{fmt(r.operatingCF)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                              {r.capex > 0 ? `(${fmt(r.capex)})` : "—"}
                            </td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-bold ${
                              r.freeCF >= 0 ? "text-chart-3" : "text-destructive"
                            }`}>{fmt(r.freeCF)}</td>
                            <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${
                              r.cumulative >= 0 ? "" : "text-destructive"
                            }`}>{fmt(r.cumulative)}</td>
                          </tr>
                        ))}
                        <tr className="bg-muted/40 font-bold border-t-2 border-border">
                          <td className="sticky left-0 z-10 px-3 py-2 bg-muted/40 border-r border-border/30">TOTAL</td>
                          <td className="px-3 py-2 text-center text-muted-foreground">—</td>
                          <td className="px-3 py-2 text-right text-muted-foreground">—</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${
                            totalOpCF >= 0 ? "text-chart-3" : "text-destructive"
                          }`}>{fmt(totalOpCF)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {totalCapex > 0 ? `(${fmt(totalCapex)})` : "—"}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums ${
                            totalFreeCF >= 0 ? "text-chart-3" : "text-destructive"
                          }`}>{fmt(totalFreeCF)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">—</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                    Op. Cash Flow = EBIT (Revenue − Variable − Fuel − Fixed − Lease). CapEx = vehicle down payments
                    on acquisition months only. Free CF = Op. CF − CapEx. Cumulative starts at $0 from Month 1.
                  </p>
                </>
              );
            })()}
          </CardContent>
        </Card>
      </section>

      {/* ── SECTION 2: All 3 Scenarios ── */}
      <section data-testid="section-scenarios">
        <SectionTitle>All 3 Scenarios — Monthly Comparison</SectionTitle>

        {/* Scenario methodology explanation */}
        <Card className="mb-4">
          <CardContent className="p-4">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">How Scenarios Are Calculated</p>
            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Each scenario applies a <strong>revenue multiplier</strong> and an <strong>expense multiplier</strong> to
              your current operating baseline, then compounds monthly using your{" "}
              <strong>{(growthRate * 100).toFixed(1)}% annual growth rate</strong>.
              Fuel always uses the live AAA market price. The Base Case is your exact current settings.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="p-2.5 rounded-lg border border-border bg-muted/20">
                <p className="text-xs font-bold mb-1" style={{ color: SCENARIO_COLORS["Best Case"] }}>Best Case</p>
                <p className="text-xs text-muted-foreground">Revenue <strong className="text-foreground">+20%</strong></p>
                <p className="text-xs text-muted-foreground">Expenses <strong className="text-foreground">−10%</strong></p>
                <p className="text-[10px] text-muted-foreground mt-1">High demand, efficient routes, low idle time</p>
              </div>
              <div className="p-2.5 rounded-lg border border-primary/30 bg-primary/5">
                <p className="text-xs font-bold mb-1" style={{ color: SCENARIO_COLORS["Base Case"] }}>Base Case</p>
                <p className="text-xs text-muted-foreground">Revenue <strong className="text-foreground">as-is</strong></p>
                <p className="text-xs text-muted-foreground">Expenses <strong className="text-foreground">as-is</strong></p>
                <p className="text-[10px] text-muted-foreground mt-1">Current trajectory — your exact settings</p>
              </div>
              <div className="p-2.5 rounded-lg border border-border bg-muted/20">
                <p className="text-xs font-bold mb-1" style={{ color: SCENARIO_COLORS["Worst Case"] }}>Worst Case</p>
                <p className="text-xs text-muted-foreground">Revenue <strong className="text-foreground">−20%</strong></p>
                <p className="text-xs text-muted-foreground">Expenses <strong className="text-foreground">+15%</strong></p>
                <p className="text-[10px] text-muted-foreground mt-1">Recession, lower demand, cost pressures</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-2 font-mono">
              Revenue = Base × Multiplier × (1 + {(growthRate * 100).toFixed(1)}% ÷ 12)<sup>month</sup> &nbsp;·&nbsp; Expenses = (Fixed + Variable) × Multiplier + Fuel (live)
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Net Profit by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={scenarioChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,85%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {scenarioProjections?.map((s: any) => (
                    <Line key={s.name} dataKey={s.name} stroke={SCENARIO_COLORS[s.name] ?? "hsl(215,60%,40%)"} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Revenue by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={revenueChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,85%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  {scenarioProjections?.map((s: any) => (
                    <Line key={s.name} dataKey={s.name} stroke={SCENARIO_COLORS[s.name] ?? "hsl(215,60%,40%)"} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Scenario table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="text-xs w-max min-w-full" data-testid="scenario-table">
                <thead>
                  <tr className="bg-muted/60 text-muted-foreground">
                    <th className={thSticky} style={{ minWidth: 180 }}>Scenario / Metric</th>
                    {MONTH_LABELS.map((m) => (
                      <th key={m} className="text-right px-3 py-3 font-semibold whitespace-nowrap">{m}</th>
                    ))}
                    <th className="text-right px-4 py-3 font-semibold whitespace-nowrap bg-muted/80">Annual</th>
                  </tr>
                </thead>
                <tbody>
                  {scenarioProjections?.map((s: any, sIdx: number) => {
                    const annualRev = s.months.reduce((a: number, m: any) => a + m.revenue, 0);
                    const annualPft = s.months.reduce((a: number, m: any) => a + m.profit, 0);
                    return (
                      <>
                        <tr
                          key={`${s.name}-rev`}
                          className={`border-t ${sIdx === 0 ? "" : "border-t-2"} border-border`}
                        >
                          <td className="sticky left-0 z-10 bg-background px-4 py-2.5 font-semibold whitespace-nowrap" style={{ color: SCENARIO_COLORS[s.name] }}>
                            {s.name} — Revenue
                          </td>
                          {s.months.map((m: any, i: number) => (
                            <td key={i} className="px-3 py-2.5 text-right tabular-nums">{fmt(m.revenue)}</td>
                          ))}
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold bg-muted/20">{fmt(annualRev)}</td>
                        </tr>
                        <tr key={`${s.name}-pft`} className="border-t border-border bg-muted/20">
                          <td className="sticky left-0 z-10 bg-muted/20 px-4 py-2.5 whitespace-nowrap" style={{ color: SCENARIO_COLORS[s.name] }}>
                            {s.name} — Profit
                          </td>
                          {s.months.map((m: any, i: number) => (
                            <td key={i} className={`px-3 py-2.5 text-right tabular-nums font-medium ${m.profit >= 0 ? "text-chart-3" : "text-destructive"}`}>
                              {fmt(m.profit)}
                            </td>
                          ))}
                          <td className={`px-4 py-2.5 text-right tabular-nums font-semibold bg-muted/30 ${annualPft >= 0 ? "text-chart-3" : "text-destructive"}`}>
                            {fmt(annualPft)}
                          </td>
                        </tr>
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── SECTION 3: Expense Categories ── */}
      <section data-testid="section-expense-detail">
        <SectionTitle>Expense Categories by Month (Base Case)</SectionTitle>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Expense Mix by Month</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={expenseDetailData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,85%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Fixed" stackId="a" fill="hsl(215, 60%, 40%)" />
                  <Bar dataKey="Variable" stackId="a" fill="hsl(34, 80%, 50%)" />
                  <Bar dataKey="Fuel" stackId="a" fill="hsl(350, 55%, 48%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Category Trends</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={expenseDetailData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,85%)" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={fmtK} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 11 }} />
                  <Line dataKey="Fixed" stroke="hsl(215, 60%, 40%)" strokeWidth={2} dot={false} />
                  <Line dataKey="Variable" stroke="hsl(34, 80%, 50%)" strokeWidth={2} dot={false} />
                  <Line dataKey="Fuel" stroke="hsl(350, 55%, 48%)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Expense detail table — expandable */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="text-xs w-max min-w-full" data-testid="expense-detail-table">
                <thead>
                  <tr className="bg-muted/60 text-muted-foreground">
                    <th className={thSticky} style={{ minWidth: 160 }}>Category</th>
                    {MONTH_LABELS.map((m) => (
                      <th key={m} className="text-right px-3 py-3 font-semibold whitespace-nowrap">{m}</th>
                    ))}
                    <th className="text-right px-4 py-3 font-semibold whitespace-nowrap bg-muted/80">Annual</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Fixed — expandable */}
                  <ExpandableRows
                    label="Fixed"
                    values={MONTH_LABELS.map(() => totalFixed)}
                    total={totalFixed * 12}
                    valueClassName="text-primary"
                  >
                    {expFixedChildren.map((child) => (
                      <ChildRow key={child.label} {...child} />
                    ))}
                  </ExpandableRows>

                  {/* Variable — expandable */}
                  <ExpandableRows
                    label="Variable"
                    values={MONTH_LABELS.map(() => totalVariable)}
                    total={totalVariable * 12}
                    valueClassName=""
                  >
                    {expVariableChildren.map((child) => (
                      <ChildRow key={child.label} {...child} />
                    ))}
                  </ExpandableRows>

                  {/* Fuel — expandable */}
                  <ExpandableRows
                    label="Fuel (Live)"
                    values={MONTH_LABELS.map(() => monthlyFuelCost)}
                    total={monthlyFuelCost * 12}
                    valueClassName="text-destructive/80"
                  >
                    <tr className="border-t border-border/50 bg-muted/10">
                      <td className="sticky left-0 z-10 bg-muted/10 px-4 py-2 whitespace-nowrap">
                        <span className="flex items-center gap-1.5 pl-5 text-xs text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                          Gallons/month
                        </span>
                      </td>
                      {MONTH_LABELS.map((_, i) => (
                        <td key={i} className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                          {Math.round(gallonsPerMonth)}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right tabular-nums text-xs font-medium bg-muted/20 text-muted-foreground">
                        {Math.round(gallonsPerMonth * 12)}
                      </td>
                    </tr>
                    <tr className="border-t border-border/50 bg-muted/10">
                      <td className="sticky left-0 z-10 bg-muted/10 px-4 py-2 whitespace-nowrap">
                        <span className="flex items-center gap-1.5 pl-5 text-xs text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                          Price/gal ({gasPriceSource})
                        </span>
                      </td>
                      {MONTH_LABELS.map((_, i) => (
                        <td key={i} className="px-3 py-2 text-right tabular-nums text-xs text-muted-foreground">
                          ${costPerGallon.toFixed(3)}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right tabular-nums text-xs font-medium bg-muted/20 text-muted-foreground">—</td>
                    </tr>
                  </ExpandableRows>

                  {/* Total */}
                  <ExpandableRows
                    label="Total Expenses"
                    values={MONTH_LABELS.map(() => totalFixed + totalVariable + monthlyFuelCost)}
                    total={(totalFixed + totalVariable + monthlyFuelCost) * 12}
                    valueClassName="font-semibold"
                    separatorTop
                  />
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
