import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  ReferenceLine,
} from "recharts";

const CHART_COLORS = [
  "hsl(215, 60%, 40%)",
  "hsl(34, 80%, 50%)",
  "hsl(160, 50%, 42%)",
  "hsl(350, 55%, 48%)",
  "hsl(262, 45%, 52%)",
];

const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtD = (n: number, d = 2) => `$${n.toFixed(d)}`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

// ── Print-safe section header ──
function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8 print:mb-6 print:break-inside-avoid">
      <div className="flex items-baseline gap-3 border-b-2 border-primary pb-1 mb-4">
        <span className="text-xs font-bold text-primary uppercase tracking-widest">{num}</span>
        <h2 className="text-base font-bold text-foreground uppercase tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ── Sub-section divider ──
function SubSection({ label }: { label: string }) {
  return (
    <div className="mb-2 pb-1 border-b border-border/40 mt-5">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
    </div>
  );
}

// ── Metric row for summary tables ──
function MetricRow({ label, value, sub, bold, indent }: {
  label: string; value: string; sub?: string; bold?: boolean; indent?: boolean;
}) {
  return (
    <tr className="border-b border-border/40">
      <td className={`py-2 px-3 text-sm ${indent ? "pl-8 text-muted-foreground" : bold ? "font-semibold" : ""}`}>{label}</td>
      <td className={`py-2 px-3 text-right tabular-nums text-sm ${bold ? "font-bold" : "font-medium"}`}>{value}</td>
      {sub !== undefined && <td className="py-2 px-3 text-right tabular-nums text-xs text-muted-foreground">{sub}</td>}
    </tr>
  );
}

// ── Editable Use of Proceeds ──
function UseOfProceedsSection({ businessName, initialValue }: { businessName: string; initialValue: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(initialValue);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setText(initialValue); }, [initialValue]);

  const saveMutation = useMutation({
    mutationFn: (value: string) =>
      apiRequest("PATCH", "/api/settings/use-of-proceeds", { useOfProceeds: value }),
    onSuccess: () => {
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
  });

  const handleChange = useCallback((value: string) => {
    setText(value);
    setSaveStatus("saving");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveMutation.mutate(value), 800);
  }, [saveMutation]);

  return (
    <Section num="8" title="Use of Proceeds">
      <p className="text-xs text-muted-foreground mb-2">
        Describe the financing amount requested, intended use of proceeds, and proposed repayment structure.
        Type directly below, or paste from another document.
      </p>
      <div className="relative">
        <textarea
          data-testid="use-of-proceeds-input"
          className="w-full min-h-[180px] p-3 text-sm bg-background border border-border rounded-lg
            focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y
            placeholder:text-muted-foreground/50 leading-relaxed"
          placeholder={`Describe how ${businessName} intends to use the requested financing — e.g., fleet expansion (2 additional vehicles), working capital, driver wages, equipment upgrades, or refinancing existing debt. Include the total amount requested and proposed repayment terms where applicable.`}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onPaste={(e) => { setTimeout(() => handleChange(e.currentTarget.value), 0); }}
        />
        <span className={`absolute bottom-2 right-3 text-xs transition-opacity ${
          saveStatus === "idle" ? "opacity-0" : "opacity-100"
        } ${saveStatus === "saved" ? "text-chart-3" : "text-muted-foreground"}`}>
          {saveStatus === "saving" ? "Saving\u2026" : "Saved"}
        </span>
      </div>
    </Section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Report() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/financial-summary"],
    queryFn: () => apiRequest("GET", "/api/financial-summary").then((r) => r.json()),
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
      </div>
    );
  }

  const {
    profitability, expenses, fuelCost, scenarioProjections,
    settings, gasPrice, gasPriceSource, annualProjection, revenueModel, driverTimeline,
  } = data;

  const fleetByMonth: number[] = driverTimeline?.fleetByMonth ?? Array(12).fill(settings?.fleetSize ?? 1);
  const driverMilestones: any[] = driverTimeline?.milestones ?? [];
  const baseFleet = settings?.fleetSize ?? 1;
  const peakFleet = Math.max(...fleetByMonth);
  const hasMilestones = driverMilestones.length > 0;

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // Base Case scenario — fleet-scaled month by month
  const baseScenario = scenarioProjections?.find((s: any) => s.name === "Base Case");
  const baseMonths: any[] = baseScenario?.months ?? [];

  // True fleet-scaled annual totals (sum of 12 months from Base Case)
  const trueAnnualRevenue = baseMonths.reduce((s: number, m: any) => s + m.revenue, 0);
  const trueAnnualExpenses = baseMonths.reduce((s: number, m: any) => s + m.expenses, 0);
  const trueAnnualProfit = baseMonths.reduce((s: number, m: any) => s + m.profit, 0);
  const trueAnnualMargin = trueAnnualRevenue > 0 ? (trueAnnualProfit / trueAnnualRevenue) * 100 : 0;

  // Month 1 base values (1-driver baseline)
  const m1Revenue = profitability.monthlyRevenue;
  const m1Expenses = profitability.totalExpenses;
  const m1Profit = profitability.monthlyProfit;

  const noi = m1Profit * 12;
  const fixedChargeCoverage = profitability.fccr ?? (m1Revenue / m1Expenses);
  const breakEvenRevenue = profitability.breakEvenRevenue;
  const cmRatio = profitability.cmRatio ?? 0;
  const contributionMargin = profitability.contributionMargin ?? 0;

  const pieData = [
    { name: "Fixed", value: expenses.totalFixed },
    { name: "Variable", value: expenses.totalVariable },
    { name: "Fuel (Live)", value: expenses.monthlyFuelCost },
  ];

  // Scenario chart data with fleet step markers
  const scenarioChartData = Array.from({ length: 12 }, (_, i) => {
    const row: Record<string, any> = { month: `M${i + 1}`, fleet: fleetByMonth[i] };
    scenarioProjections?.forEach((s: any) => { row[s.name] = s.months[i]?.revenue ?? 0; });
    return row;
  });

  // Annual scenario summary
  const scenarioSummary = scenarioProjections?.map((s: any) => ({
    name: s.name,
    annualRevenue: s.months.reduce((a: number, m: any) => a + m.revenue, 0),
    annualExpenses: s.months.reduce((a: number, m: any) => a + m.expenses, 0),
    annualProfit: s.months.reduce((a: number, m: any) => a + m.profit, 0),
    margin: (() => {
      const rev = s.months.reduce((a: number, m: any) => a + m.revenue, 0);
      const pft = s.months.reduce((a: number, m: any) => a + m.profit, 0);
      return rev > 0 ? ((pft / rev) * 100).toFixed(1) : "0.0";
    })(),
  }));

  // Build growth periods (for narrative and tables)
  const growthPeriods: { startM: number; endM: number; fleet: number; note: string }[] = [];
  let curFleet = fleetByMonth[0];
  let periodStart = 1;
  for (let i = 1; i <= 12; i++) {
    const fleet = i < 12 ? fleetByMonth[i] : -1;
    if (fleet !== curFleet || i === 12) {
      const milestone = driverMilestones.find((m: any) => m.startMonth === periodStart);
      growthPeriods.push({
        startM: periodStart,
        endM: i,
        fleet: curFleet,
        note: periodStart === 1 ? "Starting fleet" : (milestone?.note || `Fleet grows to ${curFleet}`),
      });
      curFleet = fleet;
      periodStart = i + 1;
    }
  }

  return (
    <>
      <style>{`
        @media print {
          body { font-size: 11pt; color: #111; background: white; }
          .print\\:hidden { display: none !important; }
          .print-page { padding: 0.6in 0.75in; max-width: 100%; }
          h1, h2 { page-break-after: avoid; }
          table { page-break-inside: avoid; }
          .recharts-wrapper { page-break-inside: avoid; }
          .no-print-break { page-break-inside: avoid; }
        }
      `}</style>

      <div className="print-page p-8 max-w-4xl mx-auto" data-testid="report-page">

        {/* ── COVER ── */}
        <div className="mb-10 print:mb-8">
          <div className="h-2 bg-primary rounded-sm mb-6 print:mb-4" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Confidential — For Financing Purposes</p>
              <h1 className="text-2xl font-bold text-foreground leading-tight">{settings.businessName}</h1>
              <p className="text-base text-muted-foreground mt-1">Business Financial Summary &amp; Projections</p>
            </div>
            <Button onClick={() => window.print()} variant="outline" size="sm" className="print:hidden mt-1" data-testid="button-print">
              <Printer className="w-4 h-4 mr-1.5" />Print / PDF
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-muted/40 rounded-lg border border-border">
            {[
              ["Report Date", today],
              ["Industry", "Freight & Logistics"],
              ["State", settings.state],
              ["Starting Fleet", `${baseFleet} Vehicle${baseFleet !== 1 ? "s" : ""}`],
              ["Peak Fleet (Yr 1)", `${peakFleet} Vehicle${peakFleet !== 1 ? "s" : ""}`],
              ["Revenue Model", revenueModel?.usingRateModel ? "Rate-per-Mile Engine" : "Flat Revenue"],
              ["Fuel Price (Live)", `$${gasPrice?.toFixed(3)}/gal — ${gasPriceSource}`],
              ["Growth Milestones", hasMilestones ? `${driverMilestones.length} planned` : "None"],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <p className="text-sm font-semibold mt-0.5">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 p-3 border-l-4 border-primary bg-primary/5 rounded-r-lg">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This document has been prepared to provide lenders and investors with a comprehensive overview of{" "}
              {settings.businessName}'s financial position, operating metrics, growth plan, and forward projections.
              {hasMilestones && ` The business has ${driverMilestones.length} planned fleet expansion event${driverMilestones.length !== 1 ? "s" : ""} within the 12-month projection window, growing from ${baseFleet} to ${peakFleet} vehicle${peakFleet !== 1 ? "s" : ""}.`}{" "}
              All figures are based on current operating data and market-rate fuel prices sourced live from {gasPriceSource ?? "AAA"}.
              Prospective financiers should conduct independent due diligence prior to making any lending or investment decisions.
            </p>
          </div>
        </div>

        {/* ── 1. BUSINESS OVERVIEW ── */}
        <Section num="1" title="Business Overview">
          <p className="text-sm leading-relaxed text-foreground mb-4">
            {settings.businessName} is a {settings.state}-based freight and last-mile delivery company currently
            operating a fleet of {baseFleet} vehicle{baseFleet !== 1 ? "s" : ""}.
            {hasMilestones
              ? ` The company has a structured growth plan to expand to ${peakFleet} vehicle${peakFleet !== 1 ? "s" : ""} by Month ${fleetByMonth.lastIndexOf(peakFleet) + 1} of the projection period. `
              : " "}
            At the Month 1 baseline, the business generates {fmt(m1Revenue)}/month in revenue across{" "}
            {revenueModel?.totalJobTypes ?? 0} active delivery service lines.
            {hasMilestones
              ? ` With planned fleet growth, total 12-month revenue under the Base Case is projected at ${fmt(trueAnnualRevenue)}, reflecting a blended annual margin of ${fmtPct(trueAnnualMargin)}.`
              : ` Annualized, this produces ${fmt(m1Revenue * 12)} in revenue at a ${profitability.profitMargin}% net margin.`}
            {" "}The business maintains a lean cost structure with fuel costs tracked daily against live market prices.
          </p>

          {/* KPI grid — fleet-aware */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {[
              { label: "Month 1 Revenue", value: fmt(m1Revenue), note: `${fmt(m1Revenue * 12)}/yr (single vehicle)` },
              { label: "12-Month Total Revenue", value: fmt(trueAnnualRevenue), note: "Fleet-scaled Base Case", highlight: hasMilestones },
              { label: "12-Month Net Profit", value: fmt(trueAnnualProfit), note: `${fmtPct(trueAnnualMargin)} annual margin`, highlight: hasMilestones },
              { label: "Starting Fleet", value: `${baseFleet} vehicle${baseFleet !== 1 ? "s" : ""}`, note: settings.state },
              { label: "Peak Fleet (Yr 1)", value: `${peakFleet} vehicle${peakFleet !== 1 ? "s" : ""}`, note: hasMilestones ? `Month ${fleetByMonth.lastIndexOf(peakFleet) + 1} onward` : "No change planned" },
              { label: "Revenue Growth Rate", value: `${(settings.revenueGrowthRate * 100).toFixed(1)}%`, note: "Annual (compounded monthly)" },
            ].map((kpi: any) => (
              <div key={kpi.label} className={`p-3 rounded-lg border ${kpi.highlight ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"}`}>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className={`text-base font-bold tabular-nums mt-0.5 ${kpi.highlight ? "text-primary" : ""}`}>{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.note}</p>
              </div>
            ))}
          </div>

          {/* Revenue by job type summary */}
          {revenueModel?.jobTypeBreakdown?.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Revenue by Service Line (Month 1 — 1 Driver Baseline)</p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/40 text-muted-foreground">
                    <th className="text-left py-1.5 px-2 font-medium">Service Line</th>
                    <th className="text-right py-1.5 px-2 font-medium">Runs/Driver/Mo</th>
                    <th className="text-right py-1.5 px-2 font-medium">Rate/Mile</th>
                    <th className="text-right py-1.5 px-2 font-medium">Revenue/Mo</th>
                    <th className="text-right py-1.5 px-2 font-medium">% of Total</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueModel.jobTypeBreakdown.map((jt: any) => (
                    <tr key={jt.id} className="border-b border-border/30">
                      <td className="py-1.5 px-2 font-medium">{jt.name}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">{jt.runsPerDriverPerMonth ?? jt.runsPerMonth} × {jt.avgMilesPerRun}mi</td>
                      <td className="py-1.5 px-2 text-right tabular-nums">${jt.totalRatePerMile}/mi</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmt(jt.monthlyRevenue)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">
                        {m1Revenue > 0 ? ((jt.monthlyRevenue / m1Revenue) * 100).toFixed(1) : "0"}%
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/30 font-semibold">
                    <td className="py-1.5 px-2" colSpan={3}>Total (1 driver)</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{fmt(m1Revenue)}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* ── 2. INCOME STATEMENT ── */}
        <Section num="2" title="Monthly Income Statement">
          <p className="text-xs text-muted-foreground mb-3">
            The following income statement reflects <strong>Month 1 operating figures</strong> (1-driver baseline).
            {hasMilestones && ` With fleet expansion (${baseFleet}→${peakFleet} vehicles), annual figures differ from 12× monthly — see Section 6 for fleet-scaled 12-month projections.`}
          </p>
          <table className="w-full text-sm" data-testid="income-table">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left py-2 px-3 font-semibold">Line Item</th>
                <th className="text-right py-2 px-3 font-semibold">Month 1</th>
                <th className="text-right py-2 px-3 font-semibold text-xs text-muted-foreground">
                  {hasMilestones ? "12-Mo Total*" : "Annual"}
                </th>
              </tr>
            </thead>
            <tbody>
              <MetricRow
                label="Gross Revenue"
                value={fmt(m1Revenue)}
                sub={hasMilestones ? fmt(trueAnnualRevenue) : fmt(m1Revenue * 12)}
                bold
              />
              {revenueModel?.jobTypeBreakdown?.map((jt: any) => (
                <MetricRow
                  key={jt.id}
                  label={`${jt.name} (${jt.runsPerDriverPerMonth ?? jt.runsPerMonth} run${(jt.runsPerDriverPerMonth ?? jt.runsPerMonth) !== 1 ? "s" : ""}/driver × ${jt.avgMilesPerRun}mi @ $${jt.totalRatePerMile}/mi)`}
                  value={fmt(jt.monthlyRevenue)}
                  sub={hasMilestones
                    ? fmt(fleetByMonth.reduce((s, fleet) => s + jt.revenuePerDriver * fleet, 0))
                    : fmt(jt.monthlyRevenue * 12)}
                  indent
                />
              ))}
              <MetricRow label="Fixed Operating Expenses" value={`(${fmt(expenses.totalFixed)})`} sub={`(${fmt(hasMilestones ? trueAnnualExpenses * (expenses.totalFixed / m1Expenses) : expenses.totalFixed * 12)})`} />
              {expenses.fixed?.map((e: any) => (
                <MetricRow
                  key={e.id}
                  label={`${e.name}${e.scalesWithFleet ? " (× fleet)" : " (flat overhead)"}`}
                  value={`(${fmt(e.amount)})`}
                  sub={`(${e.scalesWithFleet && hasMilestones
                    ? fmt(fleetByMonth.reduce((s, f) => s + e.amount * f, 0))
                    : fmt(e.amount * 12)})`}
                  indent
                />
              ))}
              <MetricRow label="Variable Operating Expenses" value={`(${fmt(expenses.totalVariable)})`} sub={`(${fmt(hasMilestones ? fleetByMonth.reduce((s, f) => s + expenses.totalVariable * f, 0) : expenses.totalVariable * 12)})`} />
              {expenses.variable?.map((e: any) => {
                const amt = e.computedAmount ?? e.amount;
                const label = e.ratePerMile ? `${e.name} @ $${e.ratePerMile}/mi (scales with miles + fleet)` : e.name;
                const annualAmt = hasMilestones ? fleetByMonth.reduce((s, f) => s + amt * f, 0) : amt * 12;
                return (
                  <MetricRow key={e.id} label={label} value={`(${fmt(amt)})`} sub={`(${fmt(annualAmt)})`} indent />
                );
              })}
              <MetricRow
                label={`Fuel — Regular Gasoline (${gasPriceSource ?? "live"})`}
                value={`(${fmt(expenses.monthlyFuelCost)})`}
                sub={`(${fmt(hasMilestones ? fleetByMonth.reduce((s, f) => s + expenses.monthlyFuelCost * f, 0) : expenses.monthlyFuelCost * 12)})`}
              />
              <MetricRow label="Total Operating Expenses" value={`(${fmt(m1Expenses)})`} sub={`(${fmt(hasMilestones ? trueAnnualExpenses : m1Expenses * 12)})`} bold />
              <MetricRow label="Net Operating Income" value={fmt(m1Profit)} sub={fmt(hasMilestones ? trueAnnualProfit : m1Profit * 12)} bold />
              <MetricRow label="Net Profit Margin" value={`${profitability.profitMargin}%`} sub={hasMilestones ? `${fmtPct(trueAnnualMargin)} (12-mo)` : ""} />
            </tbody>
          </table>
          {hasMilestones && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              * 12-Mo Total reflects fleet-scaled figures: revenue, variable costs, and per-vehicle fixed costs
              multiply when drivers are added per the Fleet Growth Timeline.
            </p>
          )}
        </Section>

        {/* ── 3. COST STRUCTURE ── */}
        <Section num="3" title="Cost Structure Analysis">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div>
              <p className="text-sm leading-relaxed text-foreground mb-3">
                Month 1 operating costs total {fmt(m1Expenses)}, composed of{" "}
                {((expenses.totalFixed / m1Expenses) * 100).toFixed(0)}% fixed,{" "}
                {((expenses.totalVariable / m1Expenses) * 100).toFixed(0)}% variable, and{" "}
                {((expenses.monthlyFuelCost / m1Expenses) * 100).toFixed(0)}% fuel.
                {hasMilestones && ` As the fleet grows to ${peakFleet} vehicles, per-vehicle costs (insurance, driver pay, fuel, maintenance) scale proportionally, while shared overhead (QuickBooks, PO Box) remains flat.`}
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/40">
                    <th className="text-left py-1 font-medium">Category</th>
                    <th className="text-right py-1 font-medium">Month 1</th>
                    <th className="text-right py-1 font-medium">% Total</th>
                    <th className="text-right py-1 font-medium">Scales?</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "Fixed — Per Vehicle", val: expenses.fixed?.filter((e: any) => e.scalesWithFleet).reduce((s: number, e: any) => s + e.amount, 0) ?? 0, color: CHART_COLORS[0], scales: "Yes × fleet" },
                    { name: "Fixed — Overhead", val: expenses.fixed?.filter((e: any) => !e.scalesWithFleet).reduce((s: number, e: any) => s + e.amount, 0) ?? 0, color: CHART_COLORS[2], scales: "No" },
                    { name: "Variable (per-mile)", val: expenses.totalVariable, color: CHART_COLORS[1], scales: "Yes × fleet" },
                    { name: "Fuel (live price)", val: expenses.monthlyFuelCost, color: CHART_COLORS[3], scales: "Yes × fleet" },
                  ].map(({ name, val, color, scales }) => (
                    <tr key={name} className="border-b border-border/40">
                      <td className="py-1.5 pr-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: color }} />
                        {name}
                      </td>
                      <td className="py-1.5 text-right font-medium tabular-nums">{fmt(val)}</td>
                      <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                        {m1Expenses > 0 ? ((val / m1Expenses) * 100).toFixed(1) : "0"}%
                      </td>
                      <td className={`py-1.5 text-right text-xs ${scales === "No" ? "text-muted-foreground" : "text-primary"}`}>{scales}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {pieData.map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                </Pie>
                <Tooltip formatter={(v: number) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Section>

        {/* ── 4. FUEL & UNIT ECONOMICS ── */}
        <Section num="4" title="Fuel Exposure & Unit Economics">
          <p className="text-sm leading-relaxed text-foreground mb-4">
            Fuel represents a live, market-linked cost. At the current rate of {fmtD(gasPrice)}/gallon (Regular
            Gasoline, {settings.state} — sourced from {gasPriceSource ?? "AAA"}), the fleet consumes approximately{" "}
            {fuelCost.gallonsPerMonth.toLocaleString()} gallons/month per vehicle. A $0.10 movement in gas price
            equates to a {fmt(fuelCost.gallonsPerMonth * 0.10)} monthly cost swing per vehicle
            {hasMilestones ? `, scaling to ${fmt(fuelCost.gallonsPerMonth * 0.10 * peakFleet)} at peak fleet size of ${peakFleet}.` : "."}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              ["Gas Price/Gal", fmtD(gasPrice, 3)],
              ["Gal/Vehicle/Mo", fuelCost.gallonsPerMonth.toLocaleString()],
              ["Fuel Cost M1", fmt(fuelCost.monthlyFuelCost)],
              ["Fuel Cost at Peak", fmt(fuelCost.monthlyFuelCost * peakFleet)],
              ["Cost per Mile", fmtD(profitability.costPerMile, 2)],
              ["Revenue per Mile", fmtD(profitability.revenuePerMile, 2)],
              ["Spread per Mile", fmtD(profitability.revenuePerMile - profitability.costPerMile, 2)],
              ["BEP Rate/Mile", `$${(profitability.breakEvenRatePerMile ?? 0).toFixed(2)}/mi`],
            ].map(([label, value]) => (
              <div key={label as string} className="p-3 bg-muted/30 rounded-lg border border-border text-center">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-bold tabular-nums mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
            <p className="text-xs font-semibold text-primary mb-1">Fixed Charge Coverage Ratio (FCCR)</p>
            <p className="text-sm">
              <span className="font-bold tabular-nums">{fixedChargeCoverage.toFixed(2)}x</span>
              <span className="text-muted-foreground ml-2">
                (Revenue ÷ Total Expenses = {fmt(m1Revenue)} ÷ {fmt(m1Expenses)})
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Most lenders require a minimum FCCR of 1.20x–1.25x. The current ratio of {fixedChargeCoverage.toFixed(2)}x{" "}
              {fixedChargeCoverage >= 1.25
                ? "exceeds this threshold, demonstrating strong capacity to service debt obligations."
                : fixedChargeCoverage >= 1.20
                ? "meets the minimum threshold for most commercial lenders."
                : "falls below typical lender thresholds — review cost structure or revenue targets prior to application."}
            </p>
          </div>
        </Section>

        {/* ── 5. BREAK-EVEN ANALYSIS ── */}
        <Section num="5" title="Break-Even & Coverage Analysis">
          {(() => {
            const surplus = m1Revenue - breakEvenRevenue;
            const safetyMarginPct = breakEvenRevenue > 0 ? ((surplus / breakEvenRevenue) * 100).toFixed(1) : "0.0";
            const fccr = fixedChargeCoverage;

            const bepBarData = [
              { name: "BEP Revenue", value: breakEvenRevenue },
              { name: "Current Revenue", value: m1Revenue },
              { name: surplus >= 0 ? "Surplus" : "Shortfall", value: Math.abs(surplus) },
            ];

            return (
              <>
                <SubSection label="5A — Break-Even Point (BEP)" />
                <p className="text-sm leading-relaxed text-foreground mb-3">
                  The Break-Even Point is the minimum revenue rate per mile required to cover all fixed and
                  variable operating costs at zero profit. Formula:{" "}
                  <strong>(Fixed Costs + Variable Costs) ÷ Total Miles</strong>. At the current cost
                  structure (1 driver), the BEP is{" "}
                  <strong>${(profitability.breakEvenRatePerMile ?? 0).toFixed(2)}/mile</strong>{" "}
                  (equivalent to <strong>{fmt(breakEvenRevenue)}/month</strong> across{" "}
                  {expenses.totalMilesPerMonth?.toLocaleString() ?? 0} total miles).
                  The actual rate of <strong>${(profitability.revenuePerMile ?? 0).toFixed(2)}/mile</strong> places the business{" "}
                  <strong style={{ color: surplus >= 0 ? "hsl(160,50%,42%)" : "hsl(350,55%,48%)" }}>
                    {surplus >= 0
                      ? `$${(profitability.surplusRatePerMile ?? 0).toFixed(2)}/mile above break-even`
                      : `$${Math.abs(profitability.surplusRatePerMile ?? 0).toFixed(2)}/mile below break-even`}
                  </strong>.
                  {hasMilestones && ` Note: as fleet grows, both costs and revenue scale together — the BEP rate/mile remains consistent since both numerator and denominator multiply by the same fleet factor.`}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-2">Revenue vs. Break-Even Point</p>
                    <ResponsiveContainer width="100%" height={160}>
                      <BarChart data={bepBarData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                        <Tooltip formatter={(v: number) => fmt(v)} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          <Cell fill="hsl(215,60%,40%)" />
                          <Cell fill={surplus >= 0 ? "hsl(160,50%,42%)" : "hsl(350,55%,48%)"} />
                          <Cell fill={surplus >= 0 ? "hsl(160,60%,74%)" : "hsl(350,55%,72%)"} />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-2 gap-2 content-start">
                    <div className="col-span-2 p-2.5 bg-primary/5 rounded border border-primary/20">
                      <p className="text-xs text-muted-foreground">BEP Rate / Mile</p>
                      <p className="text-lg font-bold tabular-nums mt-0.5 text-primary">
                        ${(profitability.breakEvenRatePerMile ?? 0).toFixed(2)}/mile
                      </p>
                      <p className={`text-xs font-semibold mt-0.5 ${surplus >= 0 ? "text-chart-3" : "text-destructive"}`}>
                        {surplus >= 0
                          ? `✓ Actual $${(profitability.revenuePerMile ?? 0).toFixed(2)}/mi (+$${(profitability.surplusRatePerMile ?? 0).toFixed(2)}/mi above BEP)`
                          : `✗ Actual $${(profitability.revenuePerMile ?? 0).toFixed(2)}/mi ($${Math.abs(profitability.surplusRatePerMile ?? 0).toFixed(2)}/mi below BEP)`}
                      </p>
                    </div>
                    {[
                      { label: "BEP Revenue / Month", value: fmt(breakEvenRevenue) + "/mo", color: "" },
                      { label: "Total Miles / Month", value: (expenses.totalMilesPerMonth ?? 0).toLocaleString() + " mi", color: "" },
                      { label: surplus >= 0 ? "Monthly Surplus" : "Monthly Shortfall",
                        value: fmt(Math.abs(surplus)) + "/mo",
                        color: surplus >= 0 ? "text-chart-3" : "text-destructive" },
                      { label: "All-In Cost / Mile", value: "$" + (profitability.costPerMile ?? 0).toFixed(2) + "/mi", color: "" },
                    ].map((item) => (
                      <div key={item.label} className="p-2 bg-muted/30 rounded border border-border">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className={`text-sm font-bold tabular-nums mt-0.5 ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-muted/20 border border-border rounded-lg text-xs mb-6">
                  <p className="font-semibold text-foreground mb-1">BEP Calculation (Rate-per-Mile Method):</p>
                  <p className="text-muted-foreground">
                    Fixed Costs = <strong>{fmt(profitability.totalFixed ?? expenses.totalFixed)}/mo</strong>
                    {" | "}Variable Costs (incl. fuel) = <strong>{fmt(profitability.totalVariableCosts ?? expenses.totalVariable)}/mo</strong>
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    BEP Rate/Mile = ({fmt(profitability.totalFixed ?? 0)} + {fmt(profitability.totalVariableCosts ?? 0)}) ÷ {(expenses.totalMilesPerMonth ?? 0).toLocaleString()} mi = <strong>${(profitability.breakEvenRatePerMile ?? 0).toFixed(2)}/mile</strong>
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Actual Rate/Mile = {fmt(m1Revenue)} ÷ {(expenses.totalMilesPerMonth ?? 0).toLocaleString()} mi = <strong>${(profitability.revenuePerMile ?? 0).toFixed(2)}/mile</strong>
                    {" → "}<strong style={{ color: surplus >= 0 ? "hsl(160,50%,42%)" : "hsl(350,55%,48%)" }}>
                      {surplus >= 0 ? `$${(profitability.surplusRatePerMile ?? 0).toFixed(2)}/mi above BEP` : `$${Math.abs(profitability.surplusRatePerMile ?? 0).toFixed(2)}/mi below BEP`}
                    </strong>
                  </p>
                </div>

                <SubSection label="5B — Fixed Charge Coverage Ratio (FCCR)" />
                <p className="text-sm leading-relaxed text-foreground mb-3">
                  The FCCR measures a company's ability to cover its fixed expenses with operating income.
                  Formula: <strong>Revenue ÷ Total Expenses</strong>. A ratio above 1.20x is required by most
                  commercial lenders; 1.25x or higher is considered excellent.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-xs font-semibold text-primary mb-2">Current FCCR (Month 1)</p>
                    <p className={`text-3xl font-bold tabular-nums ${fccr >= 1.25 ? "text-chart-3" : fccr >= 1.20 ? "text-amber-600" : "text-destructive"}`}>{fccr.toFixed(2)}x</p>
                    <p className="text-xs text-muted-foreground mt-1">Formula: {fmt(m1Revenue)} ÷ {fmt(m1Expenses)}</p>
                    <div className="mt-3 relative h-3 bg-muted rounded-full overflow-hidden">
                      <div className="absolute top-0 h-full w-px bg-destructive/60" style={{ left: `${(1.0/3.0)*100}%` }} />
                      <div className="absolute top-0 h-full w-px bg-amber-500/60" style={{ left: `${(1.20/3.0)*100}%` }} />
                      <div className="absolute top-0 h-full w-px bg-chart-3/60" style={{ left: `${(1.25/3.0)*100}%` }} />
                      <div className={`h-full rounded-full ${fccr >= 1.25 ? "bg-chart-3" : fccr >= 1.20 ? "bg-amber-500" : "bg-destructive"}`}
                        style={{ width: `${Math.min((fccr/3.0)*100, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>1.0x min</span><span>1.20x</span><span>1.25x+</span>
                    </div>
                    <p className={`text-xs mt-2 font-semibold ${fccr >= 1.25 ? "text-chart-3" : fccr >= 1.20 ? "text-amber-600" : "text-destructive"}`}>
                      {fccr >= 1.25 ? "Exceeds lender threshold — strong debt service capacity"
                        : fccr >= 1.20 ? "Meets minimum threshold for most commercial lenders"
                        : "Below lender threshold — review cost structure before application"}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="p-3 bg-muted/30 border border-border rounded-lg">
                      <p className="text-xs font-semibold text-foreground mb-1">BEP vs. FCCR — Key Distinction</p>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground border-b border-border/40">
                            <th className="text-left py-1 font-medium">Metric</th>
                            <th className="text-left py-1 font-medium">Answers</th>
                            <th className="text-right py-1 font-medium">Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b border-border/20">
                            <td className="py-1.5 font-semibold">BEP</td>
                            <td className="py-1.5 text-muted-foreground">"How much must I sell?"</td>
                            <td className="py-1.5 text-right font-bold tabular-nums">${(profitability.breakEvenRatePerMile ?? 0).toFixed(2)}/mi</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 font-semibold">FCCR</td>
                            <td className="py-1.5 text-muted-foreground">"Can I cover my charges?"</td>
                            <td className={`py-1.5 text-right font-bold tabular-nums ${fccr >= 1.25 ? "text-chart-3" : fccr >= 1.20 ? "text-amber-600" : "text-destructive"}`}>{fccr.toFixed(2)}x</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="p-3 bg-muted/20 border border-border rounded-lg text-xs text-muted-foreground leading-relaxed">
                      <span className="font-medium text-foreground">Lender interpretation:</span> Lenders use FCCR
                      (≥1.20x required) to assess debt repayment ability. BEP shows the minimum revenue floor.
                      Both together demonstrate financial health to prospective financiers.
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </Section>

        {/* ── 6. 12-MONTH PROJECTIONS ── */}
        <Section num="6" title="12-Month Financial Projections">
          <p className="text-sm leading-relaxed text-foreground mb-4">
            Projections span three scenarios over 12 months, each applying revenue and expense multipliers
            to the operating baseline and compounding the {(settings.revenueGrowthRate * 100).toFixed(1)}% annual
            growth rate monthly.
            {hasMilestones && ` Revenue and fleet-dependent costs step up at each driver milestone — fleet size is reflected in every month's figures.`}
            {" "}Fuel uses the live AAA market price in all scenarios.
          </p>

          {/* Staffing Plan — prominently placed */}
          {hasMilestones && (
            <div className="mb-5 p-4 bg-muted/20 border border-border rounded-lg">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Fleet Growth Plan</p>
              {/* Visual bar */}
              <div className="flex gap-1 items-end h-12 mb-3">
                {fleetByMonth.map((fleet, i) => {
                  const max = Math.max(...fleetByMonth);
                  const isMilestone = driverMilestones.some((m: any) => m.startMonth === i + 1);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                      <span className="text-[8px] font-bold text-muted-foreground">{fleet}</span>
                      <div className={`w-full rounded-t ${isMilestone ? "bg-primary" : "bg-primary/30"}`}
                        style={{ height: `${(fleet / max) * 32 + 6}px` }} />
                      <span className={`text-[7px] ${isMilestone ? "text-primary font-bold" : "text-muted-foreground"}`}>
                        M{i + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
              {/* Growth periods table */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border/40">
                    <th className="text-left py-1.5 font-semibold">Period</th>
                    <th className="text-center py-1.5 font-semibold">Fleet</th>
                    <th className="text-left py-1.5 font-semibold">Event</th>
                    <th className="text-right py-1.5 font-semibold">Monthly Revenue</th>
                    <th className="text-right py-1.5 font-semibold">Monthly Expenses</th>
                    <th className="text-right py-1.5 font-semibold">Net Profit</th>
                    <th className="text-right py-1.5 font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {growthPeriods.map((p, idx) => {
                    const sampleMonth = baseMonths[p.startM - 1];
                    const rev = sampleMonth?.revenue ?? 0;
                    const exp = sampleMonth?.expenses ?? 0;
                    const pft = sampleMonth?.profit ?? 0;
                    const margin = rev > 0 ? ((pft / rev) * 100).toFixed(1) : "0.0";
                    return (
                      <tr key={idx} className={`border-b border-border/20 ${p.startM === 1 ? "" : "bg-primary/3"}`}>
                        <td className="py-1.5 font-semibold">M{p.startM}{p.endM > p.startM ? `–M${p.endM}` : ""}</td>
                        <td className="py-1.5 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold ${p.fleet > baseFleet ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {p.fleet} {p.fleet !== 1 ? "drivers" : "driver"}
                          </span>
                        </td>
                        <td className="py-1.5 text-muted-foreground">{p.note}</td>
                        <td className="py-1.5 text-right tabular-nums font-semibold text-chart-3">{fmt(rev)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">({fmt(exp)})</td>
                        <td className={`py-1.5 text-right tabular-nums font-bold ${pft >= 0 ? "text-chart-3" : "text-destructive"}`}>{fmt(pft)}</td>
                        <td className="py-1.5 text-right tabular-nums text-muted-foreground">{margin}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Scenario methodology */}
          <div className="mb-5 p-3 bg-muted/20 border border-border rounded-lg">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-2">Scenario Methodology</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="text-left py-1.5 font-semibold">Scenario</th>
                  <th className="text-right py-1.5 font-semibold">Revenue</th>
                  <th className="text-right py-1.5 font-semibold">Expenses</th>
                  <th className="text-left py-1.5 pl-4 font-semibold">Represents</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/20">
                  <td className="py-1.5 font-semibold" style={{ color: CHART_COLORS[0] }}>Best Case</td>
                  <td className="py-1.5 text-right">+20% of base</td>
                  <td className="py-1.5 text-right">−10% of base</td>
                  <td className="py-1.5 pl-4 text-muted-foreground">High demand, efficient operations, tighter routes</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-1.5 font-semibold" style={{ color: CHART_COLORS[1] }}>Base Case</td>
                  <td className="py-1.5 text-right">100% (as-is)</td>
                  <td className="py-1.5 text-right">100% (as-is)</td>
                  <td className="py-1.5 pl-4 text-muted-foreground">Current trajectory — settings as entered, with fleet growth</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-semibold" style={{ color: CHART_COLORS[2] }}>Worst Case</td>
                  <td className="py-1.5 text-right">−20% of base</td>
                  <td className="py-1.5 text-right">+15% of base</td>
                  <td className="py-1.5 pl-4 text-muted-foreground">Recession, lower demand, cost pressures (fuel, repairs)</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-2">
              Formula: Monthly Revenue = Base Revenue × Fleet × Scenario Multiplier × (1 + Growth Rate ÷ 12)<sup>month</sup>.{" "}
              Expenses = (Fixed + Variable) × Fleet × Expense Multiplier + Fuel (live AAA).{" "}
              Fleet = {hasMilestones ? `varies by month per growth plan (${baseFleet}→${peakFleet})` : `constant at ${baseFleet}`}.
            </p>
          </div>

          {/* Revenue projection chart with fleet milestone markers */}
          <p className="text-xs font-semibold text-muted-foreground mb-2">Monthly Revenue — All Scenarios</p>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={scenarioChartData} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,85%)" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} />
              <Legend />
              {/* Fleet milestone reference lines */}
              {driverMilestones.map((m: any) => (
                <ReferenceLine
                  key={m.id}
                  x={`M${m.startMonth}`}
                  stroke="hsl(215,60%,55%)"
                  strokeDasharray="4 3"
                  label={{ value: `+${m.fleetSize - baseFleet} driver${m.fleetSize - baseFleet !== 1 ? "s" : ""}`, position: "top", fontSize: 9, fill: "hsl(215,60%,40%)" }}
                />
              ))}
              {scenarioProjections?.map((scenario: any, i: number) => (
                <Line
                  key={scenario.name}
                  data={scenario.months.map((m: any, idx: number) => ({ month: `M${idx + 1}`, value: m.revenue }))}
                  dataKey="value"
                  name={scenario.name}
                  stroke={CHART_COLORS[i]}
                  strokeWidth={i === 1 ? 3 : 1.5}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>

          {/* Month-by-month Base Case table */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Month-by-Month Base Case</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/60 text-muted-foreground border-b border-border">
                  <th className="text-left py-1.5 px-2 font-semibold">Month</th>
                  <th className="text-center py-1.5 px-2 font-semibold">Fleet</th>
                  <th className="text-right py-1.5 px-2 font-semibold">Revenue</th>
                  <th className="text-right py-1.5 px-2 font-semibold">Expenses</th>
                  <th className="text-right py-1.5 px-2 font-semibold">Net Profit</th>
                  <th className="text-right py-1.5 px-2 font-semibold">Margin</th>
                  <th className="text-right py-1.5 px-2 font-semibold">Fuel</th>
                </tr>
              </thead>
              <tbody>
                {baseMonths.map((m: any, i: number) => {
                  const fleet = fleetByMonth[i];
                  const isMilestoneMonth = driverMilestones.some((ms: any) => ms.startMonth === i + 1);
                  const margin = m.revenue > 0 ? ((m.profit / m.revenue) * 100).toFixed(1) : "0.0";
                  return (
                    <tr key={i} className={`border-b border-border/30 ${isMilestoneMonth ? "bg-primary/5" : i % 2 === 0 ? "bg-muted/10" : ""}`}>
                      <td className="py-1.5 px-2 font-medium">
                        M{i + 1}
                        {isMilestoneMonth && <span className="ml-1.5 text-[9px] bg-primary text-primary-foreground px-1 py-0.5 rounded font-bold">NEW DRIVER</span>}
                      </td>
                      <td className="py-1.5 px-2 text-center tabular-nums">{fleet}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-chart-3">{fmt(m.revenue)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">({fmt(m.expenses)})</td>
                      <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${m.profit >= 0 ? "text-chart-3" : "text-destructive"}`}>{fmt(m.profit)}</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{margin}%</td>
                      <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{fmt(m.fuelCost)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/40 font-bold border-t-2 border-border">
                  <td className="py-2 px-2">TOTAL</td>
                  <td className="py-2 px-2 text-center text-muted-foreground">—</td>
                  <td className="py-2 px-2 text-right tabular-nums text-chart-3">{fmt(trueAnnualRevenue)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">({fmt(trueAnnualExpenses)})</td>
                  <td className={`py-2 px-2 text-right tabular-nums ${trueAnnualProfit >= 0 ? "text-chart-3" : "text-destructive"}`}>{fmt(trueAnnualProfit)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmtPct(trueAnnualMargin)}</td>
                  <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{fmt(baseMonths.reduce((s: number, m: any) => s + m.fuelCost, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Annual scenario summary */}
          <table className="w-full text-sm mt-5" data-testid="scenario-table">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-2 px-3 font-semibold">Scenario</th>
                <th className="text-right py-2 px-3 font-semibold">Annual Revenue</th>
                <th className="text-right py-2 px-3 font-semibold">Annual Expenses</th>
                <th className="text-right py-2 px-3 font-semibold">Annual Profit</th>
                <th className="text-right py-2 px-3 font-semibold">Margin</th>
              </tr>
            </thead>
            <tbody>
              {scenarioSummary?.map((s: any, i: number) => (
                <tr key={s.name} className={`border-b border-border/40 ${i % 2 === 0 ? "bg-muted/20" : ""}`}>
                  <td className="py-2 px-3 font-semibold" style={{ color: CHART_COLORS[i] }}>{s.name}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(s.annualRevenue)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(s.annualExpenses)}</td>
                  <td className={`py-2 px-3 text-right tabular-nums font-bold ${s.annualProfit >= 0 ? "text-chart-3" : "text-destructive"}`}>
                    {fmt(s.annualProfit)}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">{s.margin}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        {/* ── 7. RISK FACTORS ── */}
        <Section num="7" title="Risk Factors & Mitigants">
          <div className="space-y-3">
            {[
              {
                risk: "Fuel Price Volatility",
                detail: `Fuel represents ${((expenses.monthlyFuelCost / m1Expenses) * 100).toFixed(0)}% of Month 1 expenses and is subject to commodity market fluctuations. A $0.50/gal increase would add ${fmt(fuelCost.gallonsPerMonth * 0.50)}/month per vehicle, or ${fmt(fuelCost.gallonsPerMonth * 0.50 * peakFleet)} at peak fleet.`,
                mitigant: "Route optimization, fuel-efficient driving programs, and fuel surcharge provisions in delivery contracts can offset exposure.",
              },
              ...(hasMilestones ? [{
                risk: "Fleet Expansion Execution",
                detail: `The plan calls for growing from ${baseFleet} to ${peakFleet} vehicle${peakFleet !== 1 ? "s" : ""} across ${driverMilestones.length} hiring event${driverMilestones.length !== 1 ? "s" : ""}. Each addition requires successful driver recruitment, vehicle acquisition, insurance setup, and client volume to fill the additional capacity.`,
                mitigant: "Phased hiring tied to contract commitments, pre-approved vehicle financing, and maintaining a qualified driver pipeline reduces execution risk at each milestone.",
              }] : []),
              {
                risk: "Revenue Concentration",
                detail: "Dependence on a limited number of delivery platforms (Uber Freight, RoadieXD, FedEx/UPS) may expose the business to revenue shortfalls if a major platform changes its rate structure or reduces available loads.",
                mitigant: "Diversifying across direct government (SAM.gov), e-commerce, and long-haul contracts alongside platform work provides revenue stability.",
              },
              {
                risk: "Vehicle Maintenance & Downtime",
                detail: `Unplanned mechanical failures reduce fleet utilization and revenue-generating capacity while adding variable expense. At ${peakFleet} vehicle${peakFleet !== 1 ? "s" : ""}, simultaneous downtime events are more probable.`,
                mitigant: "Proactive preventive maintenance schedules, maintenance reserves, and roadside assistance programs mitigate this exposure.",
              },
              {
                risk: "Regulatory & Compliance",
                detail: "DOT regulations, driver hours-of-service rules, HAZMAT certification requirements, and state permit requirements impose ongoing compliance costs and operational constraints.",
                mitigant: "HAZMAT/HAZWOPER/OSHA certifications already held. GPS/telematics systems and fleet management software support ongoing compliance tracking.",
              },
            ].map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-3 p-3 rounded-lg border border-border bg-muted/10 text-sm">
                <div className="col-span-12 sm:col-span-3 font-semibold text-foreground">{item.risk}</div>
                <div className="col-span-12 sm:col-span-4 text-muted-foreground text-xs leading-relaxed">{item.detail}</div>
                <div className="col-span-12 sm:col-span-5 text-xs leading-relaxed">
                  <span className="font-medium text-chart-3">Mitigant: </span>{item.mitigant}
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ── 8. USE OF PROCEEDS ── */}
        <UseOfProceedsSection businessName={settings.businessName} initialValue={settings.useOfProceeds ?? ""} />

        {/* ── FOOTER ── */}
        <div className="border-t-2 border-border pt-4 mt-6">
          <div className="flex items-start justify-between text-xs text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground">{settings.businessName}</p>
              <p>Confidential Financial Report — Prepared {today}</p>
              <p>Gas prices: {gasPriceSource ?? "AAA"} · Fuel: Regular Gasoline · State: {settings.state}</p>
              {hasMilestones && <p>Fleet growth plan: {baseFleet}→{peakFleet} vehicles across {driverMilestones.length} milestone{driverMilestones.length !== 1 ? "s" : ""}</p>}
            </div>
            <div className="text-right">
              <p>Generated by a SYNQ Application</p>
              <p className="mt-0.5 italic">For financing purposes only.</p>
              <p>All figures subject to independent verification.</p>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
