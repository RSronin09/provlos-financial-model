import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, useEffect, useCallback } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
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
    <Section num="11" title="Use of Proceeds">
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
  const reportRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["/api/financial-summary"],
    queryFn: () => apiRequest("GET", "/api/financial-summary").then((r) => r.json()),
  });

  async function handleExportPDF() {
    const el = reportRef.current;
    if (!el) return;
    setPdfLoading(true);
    try {
      // Temporarily fix width to 960px so html2canvas captures full desktop layout
      // regardless of current viewport size (mobile users get the same PDF)
      const prevWidth = el.style.width;
      const prevMinWidth = el.style.minWidth;
      el.style.width = "960px";
      el.style.minWidth = "960px";
      // Allow layout to reflow before capture
      await new Promise((r) => setTimeout(r, 100));

      // Capture at 2x for crisp text, full element width
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
        windowWidth: 960,
        width: el.scrollWidth,
        height: el.scrollHeight,
      });

      // Restore original width
      el.style.width = prevWidth;
      el.style.minWidth = prevMinWidth;

      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
      const pageW = pdf.internal.pageSize.getWidth();  // 612pt
      const pageH = pdf.internal.pageSize.getHeight(); // 792pt
      const margin = 40; // pt — left/right/top/bottom margin

      // Content area inside margins
      const contentW = pageW - margin * 2;
      // Scale image to fit content width
      const scale = contentW / canvas.width;
      const imgW = contentW;
      const imgH = canvas.height * scale;

      // Usable height per page (between top and bottom margins)
      const usableH = pageH - margin * 2;
      const totalPages = Math.ceil(imgH / usableH);

      const imgData = canvas.toDataURL("image/png");

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) pdf.addPage();
        // y position: start at top margin, shift image up by one usable page height per page
        const yPos = margin - page * usableH;
        pdf.addImage(imgData, "PNG", margin, yPos, imgW, imgH);

        // White rectangles to mask content that bleeds into the margin areas
        // Top mask
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, pageW, margin, "F");
        // Bottom mask
        pdf.rect(0, pageH - margin, pageW, margin, "F");
        // Left mask
        pdf.rect(0, 0, margin, pageH, "F");
        // Right mask
        pdf.rect(pageW - margin, 0, margin, pageH, "F");
      }

      const fileName = `${(data?.settings?.businessName ?? "report").replace(/\s+/g, "_")}_Financial_Report.pdf`;
      pdf.save(fileName);
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      // Always restore width even if capture fails
      if (reportRef.current) {
        reportRef.current.style.width = "";
        reportRef.current.style.minWidth = "";
      }
      setPdfLoading(false);
    }
  }

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
      </div>
    );
  }

  const {
    profitability, expenses, fuelCost, scenarioProjections,
    settings, gasPrice, gasPriceSource, annualProjection, revenueModel, driverTimeline,
  } = data;

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  // ── Base Case scenario data ──
  const baseScenario = scenarioProjections?.find((s: any) => s.name === "Base Case");
  const baseMonths: any[] = baseScenario?.months ?? [];

  // ── Driver/fleet timeline ──
  const driversByMonth: number[] = driverTimeline?.driversByMonth ?? Array(12).fill(1);
  const milesByMonth: number[] = driverTimeline?.milesByMonth ?? Array(12).fill(settings?.totalMilesPerMonth ?? 0);
  const rampMonthIndices: number[] = driverTimeline?.rampMonthIndices ?? [];

  // ── Month 1 baseline ──
  const m1Revenue = profitability?.monthlyRevenue ?? 0;
  const m1Expenses = profitability?.totalExpenses ?? 0;
  const m1Profit = profitability?.monthlyProfit ?? 0;
  const m1Margin = m1Revenue > 0 ? (m1Profit / m1Revenue) * 100 : 0;

  // ── True annual totals from Base Case ──
  const trueAnnualRevenue = baseMonths.reduce((s: number, m: any) => s + (m.revenue ?? 0), 0);
  const trueAnnualExpenses = baseMonths.reduce((s: number, m: any) => s + (m.expenses ?? 0), 0);
  const trueAnnualProfit = baseMonths.reduce((s: number, m: any) => s + (m.profit ?? 0), 0);
  const trueAnnualMargin = trueAnnualRevenue > 0 ? (trueAnnualProfit / trueAnnualRevenue) * 100 : 0;

  // ── FCCR & BEP ──
  const fccr = profitability?.fccr ?? (m1Revenue > 0 ? m1Revenue / m1Expenses : 0);
  const breakEvenRevenue = profitability?.breakEvenRevenue ?? 0;
  const cmRatio = profitability?.cmRatio ?? 0;
  const contributionMargin = profitability?.contributionMargin ?? 0;
  const costPerMile = profitability?.costPerMile ?? 0;
  const revenuePerMile = profitability?.revenuePerMile ?? 0;
  const breakEvenRatePerMile = profitability?.breakEvenRatePerMile ?? 0;
  const surplusRatePerMile = profitability?.surplusRatePerMile ?? 0;

  // ── Settings ──
  const businessName = settings?.businessName ?? "Business";
  const stateCode = settings?.state ?? "—";
  const fleetSize = settings?.fleetSize ?? 1;
  const totalMilesPerMonth = settings?.totalMilesPerMonth ?? 0;
  const milesIncrement = settings?.monthlyMilesIncrement ?? 0;
  const avgMpg = settings?.avgMpg ?? 7;
  const baseRatePerMile = settings?.baseRatePerMile ?? 0;
  const marginTarget = settings?.marginTarget ?? 0;
  const marketFactor = settings?.marketFactor ?? 0;
  const truckDownPayment = settings?.truckDownPayment ?? 0;
  const monthlyLeasePayment = settings?.monthlyLeasePayment ?? 0;
  const useRateModel = settings?.useRateModel ?? false;

  // ── Fuel ──
  const gallonsPerMonth = fuelCost?.gallonsPerMonth ?? 0;
  const monthlyFuelCost = fuelCost?.monthlyFuelCost ?? expenses?.monthlyFuelCost ?? 0;
  const costPerGallon = fuelCost?.costPerGallon ?? gasPrice ?? 0;

  // ── Revenue model / job types ──
  const jobTypes: any[] = revenueModel?.jobTypeBreakdown ?? [];
  const totalM1Revenue = jobTypes.reduce((s: number, j: any) => s + (j.monthlyRevenue ?? 0), 0) || m1Revenue;

  // ── Cost breakdown ──
  const fixedExpenses: any[] = expenses?.fixed ?? [];
  const variableExpenses: any[] = expenses?.variable ?? [];
  const totalFixed = expenses?.totalFixed ?? profitability?.totalFixed ?? 0;
  const totalVariable = expenses?.totalVariable ?? profitability?.totalVariable ?? 0;

  // ── Computed base rate ──
  const computedBaseRate = baseRatePerMile * (1 + marginTarget / 100) * (1 + marketFactor / 100);

  // ── Scenario chart data ──
  const scenarioChartData = Array.from({ length: 12 }, (_, i) => {
    const row: Record<string, any> = { month: `M${i + 1}` };
    scenarioProjections?.forEach((s: any) => { row[s.name] = Math.round(s.months[i]?.revenue ?? 0); });
    return row;
  });

  // ── Annual scenario summary ──
  const scenarioSummary = scenarioProjections?.map((s: any) => {
    const rev = s.months.reduce((a: number, m: any) => a + (m.revenue ?? 0), 0);
    const exp = s.months.reduce((a: number, m: any) => a + (m.expenses ?? 0), 0);
    const pft = s.months.reduce((a: number, m: any) => a + (m.profit ?? 0), 0);
    const ebit = s.months.reduce((a: number, m: any) => a + (m.ebit ?? m.profit ?? 0), 0);
    return { name: s.name, rev, exp, pft, ebit, margin: rev > 0 ? (pft / rev) * 100 : 0 };
  }) ?? [];

  // ── Vehicle financing schedule (12 months) ──
  const vehicleSchedule = Array.from({ length: 12 }, (_, i) => {
    const m = baseMonths[i] ?? {};
    const drivers = driversByMonth[i] ?? 1;
    const miles = milesByMonth[i] ?? totalMilesPerMonth;
    const prevDrivers = i === 0 ? 1 : (driversByMonth[i - 1] ?? 1);
    const newVehicles = Math.max(0, drivers - prevDrivers);
    const downPayment = m.downPayment ?? (newVehicles * truckDownPayment);
    // Lease applies to vehicles beyond the first (existing asset)
    const leaseableVehicles = Math.max(0, drivers - fleetSize);
    const lease = m.leasePayment ?? (leaseableVehicles * monthlyLeasePayment);
    return { month: i + 1, miles, drivers, newVehicles, downPayment, lease };
  });

  const totalDownPayments = vehicleSchedule.reduce((s, m) => s + m.downPayment, 0);
  const totalLeasePayments = vehicleSchedule.reduce((s, m) => s + m.lease, 0);
  let cumulativeLease = 0;

  // ── Fuel sensitivity table ──
  const fuelSensDeltas = [-0.50, -0.25, -0.10, 0.10, 0.25, 0.50];
  const peakDrivers = Math.max(...driversByMonth);

  // ── BEP chart data ──
  const bepChartData = [
    { name: "BEP Revenue", value: Math.round(breakEvenRevenue) },
    { name: "Month 1 Revenue", value: Math.round(m1Revenue) },
  ];

  // ── FCCR gauge ──
  const fccrClamped = Math.min(fccr, 3);
  const fccrPct = (fccrClamped / 3) * 100;

  // ── Per-mile cost waterfall ──
  const perMileRows: { name: string; cpm: number; type: string }[] = [];
  variableExpenses.forEach((v: any) => {
    perMileRows.push({ name: v.name, cpm: v.ratePerMile ?? (totalMilesPerMonth > 0 ? (v.computedAmount ?? v.amount ?? 0) / totalMilesPerMonth : 0), type: "Variable" });
  });
  if (totalMilesPerMonth > 0) {
    perMileRows.push({ name: "Fuel", cpm: monthlyFuelCost / totalMilesPerMonth, type: "Fuel" });
    fixedExpenses.forEach((f: any) => {
      perMileRows.push({ name: f.name + " (fixed alloc.)", cpm: (f.amount ?? 0) / totalMilesPerMonth, type: "Fixed" });
    });
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

      <div ref={reportRef} className="print-page p-8 max-w-5xl mx-auto bg-white" data-testid="report-page">

        {/* ══════════════════════════════════════════════════════════════
            COVER PAGE
        ══════════════════════════════════════════════════════════════ */}
        <div className="mb-12 print:mb-8 print:break-inside-avoid">
          <div className="h-2 bg-primary rounded-sm mb-6" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">Confidential — For Financing Purposes</p>
              <h1 className="text-3xl font-bold text-foreground leading-tight">{businessName}</h1>
              <p className="text-base text-muted-foreground mt-1">Business Financial Summary &amp; Investor Report</p>
            </div>
            <Button onClick={handleExportPDF} disabled={pdfLoading} variant="outline" size="sm" className="mt-1" data-testid="button-print">
              {pdfLoading
                ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Generating PDF…</>
                : <><Printer className="w-4 h-4 mr-1.5" />Export PDF</>
              }
            </Button>
          </div>

          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-muted/40 rounded-lg border border-border text-xs">
            <div><span className="text-muted-foreground block">Report Date</span><span className="font-semibold">{today}</span></div>
            <div><span className="text-muted-foreground block">Industry</span><span className="font-semibold">Freight &amp; Logistics</span></div>
            <div><span className="text-muted-foreground block">State</span><span className="font-semibold">{stateCode}</span></div>
            <div><span className="text-muted-foreground block">Starting Fleet</span><span className="font-semibold">{fleetSize} Vehicle{fleetSize !== 1 ? "s" : ""}</span></div>
            <div><span className="text-muted-foreground block">Starting Miles/Mo</span><span className="font-semibold">{totalMilesPerMonth.toLocaleString()} mi</span></div>
            <div><span className="text-muted-foreground block">Monthly Miles Growth</span><span className="font-semibold">{milesIncrement > 0 ? `+${milesIncrement.toLocaleString()} mi/mo` : "None"}</span></div>
            <div><span className="text-muted-foreground block">Fuel Price (Live)</span><span className="font-semibold">{fmtD(costPerGallon)}/gal</span></div>
            <div><span className="text-muted-foreground block">Revenue Model</span><span className="font-semibold">{useRateModel ? "Rate-Per-Mile" : "Flat Rate"}</span></div>
          </div>

          <div className="mt-5 p-4 bg-muted/20 rounded-lg border border-border/60">
            <p className="text-sm text-foreground leading-relaxed">
              {businessName} is a {stateCode}-based freight and logistics operator providing last-mile and regional delivery services.
              This report presents a comprehensive financial summary prepared for financing review, including income projections, cost structure analysis, break-even coverage ratios, and 12-month scenario modeling.
              All revenue figures are derived from a rate-per-mile engine that accounts for job type mix, complexity, market conditions, and fuel surcharges, providing a granular and defensible basis for projected earnings.
              Prospective lenders and investors are encouraged to review Section 7 (Break-Even &amp; FCCR Analysis) and Section 8 (12-Month Projections) for primary credit assessment metrics.
            </p>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 1: BUSINESS OVERVIEW
        ══════════════════════════════════════════════════════════════ */}
        <Section num="1" title="Business Overview">
          <p className="text-sm text-foreground leading-relaxed mb-5">
            {businessName} operates a fleet of {fleetSize} commercial vehicle{fleetSize !== 1 ? "s" : ""} providing freight and delivery services in {stateCode}, generating revenue through a mix of service lines differentiated by job type, distance, urgency, and complexity.
            The business employs a rate-per-mile pricing architecture that dynamically adjusts effective rates based on market conditions, driver costs, and operational overhead, ensuring each run contributes positively to margin.
            With a current operating footprint of {totalMilesPerMonth.toLocaleString()} miles per month and a clear growth runway{milesIncrement > 0 ? ` of +${milesIncrement.toLocaleString()} miles per month` : ""}, the company is positioned to scale revenue while maintaining its per-mile cost discipline.
            This overview summarizes the key financial indicators that define the business's current operating performance and 12-month outlook.
          </p>

          {/* KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            {[
              { label: "Month 1 Revenue", value: fmt(m1Revenue), sub: "Operating baseline" },
              { label: "12-Mo Total Revenue", value: fmt(trueAnnualRevenue), sub: "Base Case, fleet-scaled" },
              { label: "12-Mo Net Profit", value: fmt(trueAnnualProfit), sub: "Base Case" },
              { label: "Annual Net Margin", value: fmtPct(trueAnnualMargin), sub: "12-mo avg" },
              { label: "FCCR (Month 1)", value: fmtD(fccr), sub: fccr >= 1.25 ? "Strong coverage" : fccr >= 1.0 ? "Adequate" : "Below threshold" },
              { label: "Miles/Month (M1)", value: totalMilesPerMonth.toLocaleString(), sub: "Starting volume" },
            ].map((kpi, i) => (
              <div key={i} className={`p-3 rounded-lg border ${i < 2 ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"}`}>
                <p className="text-xs text-muted-foreground mb-1">{kpi.label}</p>
                <p className="text-lg font-bold text-foreground tabular-nums">{kpi.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.sub}</p>
              </div>
            ))}
          </div>

          {/* Revenue by Service Line */}
          {jobTypes.length > 0 && (
            <>
              <SubSection label="Revenue by Service Line — Month 1" />
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="py-2 px-3 text-left font-semibold">Service Line</th>
                      <th className="py-2 px-3 text-right font-semibold">Job Mix %</th>
                      <th className="py-2 px-3 text-right font-semibold">Miles Alloc./Mo</th>
                      <th className="py-2 px-3 text-right font-semibold">Avg Mi/Run</th>
                      <th className="py-2 px-3 text-right font-semibold">Derived Runs/Mo</th>
                      <th className="py-2 px-3 text-right font-semibold">Eff. Rate/Mi</th>
                      <th className="py-2 px-3 text-right font-semibold">Monthly Revenue</th>
                      <th className="py-2 px-3 text-right font-semibold">% of Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobTypes.map((j: any, i: number) => {
                      const allocMiles = totalMilesPerMonth * (j.jobMixPct / 100);
                      const derivedRuns = j.avgMilesPerRun > 0 ? allocMiles / j.avgMilesPerRun : 0;
                      const pctOfTotal = totalM1Revenue > 0 ? (j.monthlyRevenue / totalM1Revenue) * 100 : 0;
                      return (
                        <tr key={j.id ?? i} className="border-b border-border/40 hover:bg-muted/20">
                          <td className="py-2 px-3 font-medium">{j.name}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtPct(j.jobMixPct)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{Math.round(allocMiles).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{j.avgMilesPerRun?.toLocaleString() ?? "—"}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{Math.round(derivedRuns).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtD(j.totalRatePerMile ?? j.computedRatePerMile ?? 0)}/mi</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmt(j.monthlyRevenue)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtPct(pctOfTotal)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-muted/30 font-bold">
                      <td className="py-2 px-3">Total</td>
                      <td className="py-2 px-3 text-right tabular-nums">100.0%</td>
                      <td className="py-2 px-3 text-right tabular-nums">{totalMilesPerMonth.toLocaleString()}</td>
                      <td className="py-2 px-3 text-right" />
                      <td className="py-2 px-3 text-right" />
                      <td className="py-2 px-3 text-right" />
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(totalM1Revenue)}</td>
                      <td className="py-2 px-3 text-right">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 2: REVENUE ARCHITECTURE
        ══════════════════════════════════════════════════════════════ */}
        <Section num="2" title="Revenue Architecture">
          <p className="text-sm text-foreground leading-relaxed mb-4">
            Revenue is computed through a rate-per-mile engine that starts with a global base rate and applies sequential multipliers for target margin and market conditions, then adds per-job-type adjustments for operational complexity, urgency premium, deadhead (empty-mile) cost, fuel surcharge, and accessorial fees per run.
            The key formula is: <strong>Effective Rate = Base Rate × (1 + Margin%) × (1 + Market Factor%) + Complexity + Urgency + Deadhead + Fuel Surcharge + (Accessorial ÷ Avg Miles)</strong>.
            This architecture ensures that every service line covers its proportional share of fixed and variable costs before contributing to operating profit.
            Global parameters set the pricing floor; per-job overrides allow fine-grained margin management across heterogeneous service lines.
          </p>

          {/* Rate component table */}
          <SubSection label="Global Rate Build-Up" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Global Base Rate", value: fmtD(baseRatePerMile) + "/mi" },
              { label: "× Margin Target", value: fmtPct(marginTarget) },
              { label: "× Market Factor", value: fmtPct(marketFactor) },
              { label: "= Computed Base Rate", value: fmtD(computedBaseRate) + "/mi" },
            ].map((item, i) => (
              <div key={i} className={`p-3 rounded-lg border ${i === 3 ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"}`}>
                <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                <p className="text-base font-bold tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Per-job rate breakdown */}
          {jobTypes.length > 0 && (
            <>
              <SubSection label="Rate Components by Job Type" />
              <div className="overflow-x-auto mb-5">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="py-2 px-3 text-left font-semibold">Job Type</th>
                      <th className="py-2 px-3 text-right font-semibold">Complexity%</th>
                      <th className="py-2 px-3 text-right font-semibold">Urgency%</th>
                      <th className="py-2 px-3 text-right font-semibold">Deadhead%</th>
                      <th className="py-2 px-3 text-right font-semibold">Fuel Surch./Mi</th>
                      <th className="py-2 px-3 text-right font-semibold">Access./Run</th>
                      <th className="py-2 px-3 text-right font-semibold">Final Rate/Mi</th>
                      <th className="py-2 px-3 text-right font-semibold">BEP Rate/Mi</th>
                      <th className="py-2 px-3 text-right font-semibold">Surplus/Mi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobTypes.map((j: any, i: number) => (
                      <tr key={j.id ?? i} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="py-2 px-3 font-medium">{j.name}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtPct((j.complexityFactor ?? 0) * 100)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtPct((j.urgencyFactor ?? 0) * 100)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtPct((j.deadheadPct ?? 0) * 100)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtD(j.fuelSurchargePerMile ?? 0)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmt(j.accessorialPerRun ?? 0)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmtD(j.totalRatePerMile ?? j.computedRatePerMile ?? 0)}/mi</td>
                        <td className="py-2 px-3 text-right tabular-nums">{fmtD(j.bepRatePerMile ?? breakEvenRatePerMile)}/mi</td>
                        <td className={`py-2 px-3 text-right tabular-nums font-semibold ${(j.surplusPerMile ?? j.surplusPerMile ?? 0) >= 0 ? "text-green-700" : "text-red-600"}`}>
                          {fmtD(j.surplusPerMile ?? 0)}/mi
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Job mix bar chart */}
              <SubSection label="Job Mix Distribution" />
              <div className="h-48 mb-5">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={jobTypes.map((j: any) => ({ name: j.name, pct: j.jobMixPct }))} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: any) => [`${Number(v).toFixed(1)}%`, "Job Mix"]} />
                    <Bar dataKey="pct" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Derived runs explanation */}
              <SubSection label="Derived Runs Methodology" />
              <div className="p-3 bg-muted/30 rounded-lg border border-border text-xs mb-4">
                <p className="font-semibold mb-1">Formula: Runs per Month = (Total Miles × Job Mix %) ÷ Avg Miles per Run</p>
                <p className="text-muted-foreground mb-2">Runs are never entered manually — they are a mathematical output of the miles volume and job type configuration. This ensures internal consistency between miles, revenue, and cost calculations.</p>
                <table className="w-full mt-2">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left py-1 px-2 font-semibold">Job Type</th>
                      <th className="text-right py-1 px-2 font-semibold">Total Miles</th>
                      <th className="text-right py-1 px-2 font-semibold">× Mix%</th>
                      <th className="text-right py-1 px-2 font-semibold">= Alloc. Miles</th>
                      <th className="text-right py-1 px-2 font-semibold">÷ Mi/Run</th>
                      <th className="text-right py-1 px-2 font-semibold">= Runs/Mo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobTypes.map((j: any, i: number) => {
                      const allocMiles = totalMilesPerMonth * (j.jobMixPct / 100);
                      const derivedRuns = j.avgMilesPerRun > 0 ? allocMiles / j.avgMilesPerRun : 0;
                      return (
                        <tr key={i} className="border-t border-border/30">
                          <td className="py-1 px-2 font-medium">{j.name}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{totalMilesPerMonth.toLocaleString()}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{fmtPct(j.jobMixPct)}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{Math.round(allocMiles).toLocaleString()}</td>
                          <td className="py-1 px-2 text-right tabular-nums">{j.avgMilesPerRun?.toLocaleString()}</td>
                          <td className="py-1 px-2 text-right tabular-nums font-semibold">{Math.round(derivedRuns).toLocaleString()}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 3: INCOME STATEMENT
        ══════════════════════════════════════════════════════════════ */}
        <Section num="3" title="Income Statement (Accountant Format)">
          <p className="text-xs text-muted-foreground mb-3">
            Month 1 represents the 1-driver, existing-vehicle baseline. Annual figures reflect the 12-month Base Case sum.
            Note: Month 1 has no vehicle lease or down payment — the initial truck is an existing asset.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="py-2 px-3 text-left font-semibold w-1/2">Line Item</th>
                  <th className="py-2 px-3 text-right font-semibold">Month 1</th>
                  <th className="py-2 px-3 text-right font-semibold">Annual (Base Case)</th>
                </tr>
              </thead>
              <tbody>
                {/* Revenue */}
                <tr className="bg-muted/20">
                  <td colSpan={3} className="py-1 px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Revenue</td>
                </tr>
                {jobTypes.map((j: any, i: number) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="py-1.5 px-3 pl-8 text-muted-foreground">{j.name}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{fmt(j.monthlyRevenue)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">—</td>
                  </tr>
                ))}
                <tr className="border-b border-border/60 font-semibold">
                  <td className="py-2 px-3">Gross Revenue</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(m1Revenue)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(trueAnnualRevenue)}</td>
                </tr>

                {/* Cost of Revenue */}
                <tr className="bg-muted/20">
                  <td colSpan={3} className="py-1 px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Cost of Revenue</td>
                </tr>
                {variableExpenses.map((v: any, i: number) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="py-1.5 px-3 pl-8 text-muted-foreground">{v.name} ({fmtD(v.ratePerMile ?? 0)}/mi)</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{fmt(v.computedAmount ?? v.amount ?? 0)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">—</td>
                  </tr>
                ))}
                <tr className="border-b border-border/20">
                  <td className="py-1.5 px-3 pl-8 text-muted-foreground">Fuel ({fmtD(costPerGallon)}/gal × {Math.round(gallonsPerMonth)} gal)</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{fmt(monthlyFuelCost)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">—</td>
                </tr>
                <tr className="border-b border-border/60 font-semibold">
                  <td className="py-2 px-3">Total Variable / Cost of Revenue</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(totalVariable + monthlyFuelCost)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-muted-foreground">—</td>
                </tr>

                {/* Gross Profit */}
                <tr className="border-b border-border/60 bg-primary/5 font-bold">
                  <td className="py-2 px-3">Gross Profit</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(m1Revenue - totalVariable - monthlyFuelCost)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(trueAnnualRevenue - (trueAnnualExpenses - totalFixed * 12))}</td>
                </tr>
                <tr className="border-b border-border/60 text-muted-foreground">
                  <td className="py-1.5 px-3 pl-8 text-xs">Gross Margin %</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs">{fmtPct(m1Revenue > 0 ? ((m1Revenue - totalVariable - monthlyFuelCost) / m1Revenue) * 100 : 0)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs">—</td>
                </tr>

                {/* Operating Expenses */}
                <tr className="bg-muted/20">
                  <td colSpan={3} className="py-1 px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Operating Expenses (Fixed Overhead)</td>
                </tr>
                {fixedExpenses.map((f: any, i: number) => (
                  <tr key={i} className="border-b border-border/20">
                    <td className="py-1.5 px-3 pl-8 text-muted-foreground">{f.name}{f.scalesWithFleet ? " (scales w/ fleet)" : ""}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{fmt(f.amount ?? 0)}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">—</td>
                  </tr>
                ))}
                <tr className="border-b border-border/20">
                  <td className="py-1.5 px-3 pl-8 text-muted-foreground">Vehicle Lease Payments (Month 1: $0 — existing asset)</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">$0</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{fmt(totalLeasePayments)}</td>
                </tr>
                <tr className="border-b border-border/60 font-semibold">
                  <td className="py-2 px-3">Total Fixed / Operating Expenses</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(totalFixed)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(totalFixed * 12 + totalLeasePayments)}</td>
                </tr>

                {/* EBIT */}
                <tr className="border-b border-border/60 bg-primary/5 font-bold">
                  <td className="py-2 px-3">Operating Income (EBIT)</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(m1Revenue - totalVariable - monthlyFuelCost - totalFixed)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(trueAnnualRevenue - trueAnnualExpenses + totalDownPayments)}</td>
                </tr>
                <tr className="border-b border-border/20 text-muted-foreground">
                  <td className="py-1.5 px-3 pl-8 text-xs">Operating Margin %</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs">{fmtPct(m1Revenue > 0 ? ((m1Revenue - totalVariable - monthlyFuelCost - totalFixed) / m1Revenue) * 100 : 0)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs">{fmtPct(trueAnnualMargin)}</td>
                </tr>

                {/* CapEx */}
                <tr className="bg-muted/20">
                  <td colSpan={3} className="py-1 px-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">Capital Expenditures</td>
                </tr>
                <tr className="border-b border-border/20">
                  <td className="py-1.5 px-3 pl-8 text-muted-foreground">Vehicle Down Payments (Month 1: $0 — existing asset)</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">$0</td>
                  <td className="py-1.5 px-3 text-right tabular-nums">{fmt(totalDownPayments)}</td>
                </tr>

                {/* Net Income */}
                <tr className="border-b border-border/60 bg-primary/10 font-bold text-base">
                  <td className="py-2.5 px-3">Net Income</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{fmt(m1Profit)}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{fmt(trueAnnualProfit)}</td>
                </tr>
                <tr className="border-b border-border/20 text-muted-foreground">
                  <td className="py-1.5 px-3 pl-8 text-xs">Net Margin %</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs">{fmtPct(m1Margin)}</td>
                  <td className="py-1.5 px-3 text-right tabular-nums text-xs">{fmtPct(trueAnnualMargin)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 4: CASH FLOW STATEMENT
        ══════════════════════════════════════════════════════════════ */}
        <Section num="4" title="12-Month Cash Flow Statement">
          {(() => {
            let cumSum = 0;
            const cfRows = baseMonths.map((m: any) => {
              const operatingCF = m.ebit ?? m.profit;
              const capex = m.downPayment ?? 0;
              const freeCF = m.profit ?? 0;
              cumSum += freeCF;
              return { month: m.month, miles: m.miles ?? 0, drivers: m.drivers ?? 1, operatingCF, capex, freeCF, cumulative: cumSum };
            });
            const totalOpCF  = cfRows.reduce((s, r) => s + r.operatingCF, 0);
            const totalCapex = cfRows.reduce((s, r) => s + r.capex, 0);
            const totalFreeCF = cfRows.reduce((s, r) => s + r.freeCF, 0);
            const cfChartData = cfRows.map(r => ({
              month: `M${r.month}`,
              'Free CF': r.freeCF,
              'CapEx': r.capex,
              Cumulative: r.cumulative,
            }));
            return (
              <>
                <p className="text-sm leading-relaxed text-foreground mb-4">
                  The cash flow statement presents month-by-month operating cash generation, capital expenditures for
                  vehicle acquisitions, and the resulting free cash flow and cumulative cash position.
                  <strong> Operating Cash Flow equals EBIT</strong> — revenue minus all operating costs including
                  variable expenses, fuel, fixed overhead, and vehicle lease payments.
                  <strong> Capital Expenditures</strong> are vehicle down payments, triggered only when fleet
                  expansion milestones are reached. Month 1 carries zero CapEx since the initial vehicle is an
                  existing asset.
                </p>

                {/* KPI tiles */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: "Total Operating CF", value: fmt(totalOpCF), note: "12-mo sum of EBIT", hi: true },
                    { label: "Total CapEx", value: totalCapex > 0 ? `(${fmt(totalCapex)})` : "$0", note: "Vehicle acquisitions", hi: false },
                    { label: "Total Free Cash Flow", value: fmt(totalFreeCF), note: "Operating CF − CapEx", hi: true },
                    { label: "Year-End Cash Position", value: fmt(cfRows[11]?.cumulative ?? 0), note: "Cumulative from M1", hi: (cfRows[11]?.cumulative ?? 0) > 0 },
                  ].map((t: any) => (
                    <div key={t.label} className={`p-3 rounded-lg border ${t.hi ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"}`}>
                      <p className="text-xs text-muted-foreground">{t.label}</p>
                      <p className={`text-sm font-bold tabular-nums mt-0.5 ${t.hi ? "text-primary" : ""}`}>{t.value}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.note}</p>
                    </div>
                  ))}
                </div>

                {/* Monthly free CF bars */}
                <p className="text-xs font-semibold text-muted-foreground mb-2">Monthly Free Cash Flow</p>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={cfChartData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="Free CF" name="Free CF" fill="hsl(160,50%,42%)" radius={[3,3,0,0]} />
                    <Bar dataKey="CapEx" name="CapEx (Acquisition)" fill="hsl(34,80%,50%)" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>

                {/* Cumulative line */}
                <p className="text-xs font-semibold text-muted-foreground mt-4 mb-2">Cumulative Cash Position</p>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={cfChartData} margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,88%)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <ReferenceLine y={0} stroke="hsl(350,55%,48%)" strokeDasharray="4 3" label={{ value: "Break-Even", position: "right", fontSize: 9, fill: "hsl(350,55%,48%)" }} />
                    <Line dataKey="Cumulative" name="Cumulative Cash" stroke="hsl(215,60%,40%)" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>

                {/* Monthly detail table */}
                <div className="mt-5 overflow-x-auto">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Month-by-Month Detail</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 border-b border-border text-muted-foreground">
                        <th className="text-left py-2 px-2 font-semibold">Month</th>
                        <th className="text-center py-2 px-2 font-semibold">Drivers</th>
                        <th className="text-right py-2 px-2 font-semibold">Miles</th>
                        <th className="text-right py-2 px-2 font-semibold">Op. Cash Flow (EBIT)</th>
                        <th className="text-right py-2 px-2 font-semibold">Capital Exp.</th>
                        <th className="text-right py-2 px-2 font-semibold">Free Cash Flow</th>
                        <th className="text-right py-2 px-2 font-semibold">Cumulative</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cfRows.map((r, i) => (
                        <tr key={i} className={`border-b border-border/30 ${
                          r.capex > 0 ? "bg-amber-500/5" : i % 2 === 0 ? "bg-muted/10" : ""
                        }`}>
                          <td className="py-1.5 px-2 font-medium">
                            M{r.month}
                            {r.capex > 0 && <span className="ml-1 text-[9px] bg-amber-500/20 text-amber-700 px-1 py-0.5 rounded font-semibold">+VEHICLE</span>}
                          </td>
                          <td className="py-1.5 px-2 text-center tabular-nums">{r.drivers}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{r.miles.toLocaleString()}</td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-medium ${r.operatingCF >= 0 ? "text-chart-3" : "text-destructive"}`}>{fmt(r.operatingCF)}</td>
                          <td className="py-1.5 px-2 text-right tabular-nums text-muted-foreground">{r.capex > 0 ? `(${fmt(r.capex)})` : "—"}</td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-bold ${r.freeCF >= 0 ? "text-chart-3" : "text-destructive"}`}>{fmt(r.freeCF)}</td>
                          <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${r.cumulative >= 0 ? "" : "text-destructive"}`}>{fmt(r.cumulative)}</td>
                        </tr>
                      ))}
                      <tr className="bg-muted/40 font-bold border-t-2 border-border">
                        <td className="py-2 px-2" colSpan={3}>TOTAL (12 Months)</td>
                        <td className={`py-2 px-2 text-right tabular-nums ${totalOpCF >= 0 ? "text-chart-3" : "text-destructive"}`}>{fmt(totalOpCF)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">{totalCapex > 0 ? `(${fmt(totalCapex)})` : "—"}</td>
                        <td className={`py-2 px-2 text-right tabular-nums ${totalFreeCF >= 0 ? "text-chart-3" : "text-destructive"}`}>{fmt(totalFreeCF)}</td>
                        <td className="py-2 px-2 text-right tabular-nums text-muted-foreground">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 p-3 bg-muted/20 border border-border rounded-lg text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Methodology: </span>
                  Operating Cash Flow = Revenue − Variable Costs − Fuel − Fixed Overhead − Vehicle Lease (no D&amp;A included).
                  Capital Expenditures = vehicle down payments on acquisition months only.
                  Free Cash Flow = Operating CF − CapEx. Cumulative position begins at $0 (add starting capital
                  reserves in the Use of Proceeds section). Month 1 CapEx = $0 — initial truck is an existing asset.
                </div>
              </>
            );
          })()}
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 5: COST STRUCTURE ANALYSIS
        ══════════════════════════════════════════════════════════════ */}
        <Section num="5" title="Cost Structure Analysis">
          <p className="text-sm text-foreground leading-relaxed mb-4">
            Total Month 1 operating expenses are {fmt(m1Expenses)}, comprising {fmtPct(totalFixed > 0 ? (totalFixed / m1Expenses) * 100 : 0)} fixed overhead,{" "}
            {fmtPct(totalVariable > 0 ? (totalVariable / m1Expenses) * 100 : 0)} variable per-mile costs, and{" "}
            {fmtPct(monthlyFuelCost > 0 ? (monthlyFuelCost / m1Expenses) * 100 : 0)} live fuel cost.
            Fixed costs provide operational predictability; variable and fuel costs scale directly with miles driven and fleet size.
            Understanding this split is essential for break-even analysis: only variable costs recede when volume falls — fixed obligations persist regardless of revenue.
          </p>

          {/* Cost category table */}
          <SubSection label="Cost Category Summary — Month 1" />
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="py-2 px-3 text-left font-semibold">Category</th>
                  <th className="py-2 px-3 text-right font-semibold">Month 1 Amount</th>
                  <th className="py-2 px-3 text-right font-semibold">% of Total Costs</th>
                  <th className="py-2 px-3 text-left font-semibold">Scaling Behavior</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { cat: "Fixed Overhead", amt: totalFixed, pct: m1Expenses > 0 ? (totalFixed / m1Expenses) * 100 : 0, behavior: "Fixed per period — does not scale with miles or fleet" },
                  { cat: "Variable Per-Mile", amt: totalVariable, pct: m1Expenses > 0 ? (totalVariable / m1Expenses) * 100 : 0, behavior: "Scales linearly with miles driven" },
                  { cat: "Fuel (Live-Priced)", amt: monthlyFuelCost, pct: m1Expenses > 0 ? (monthlyFuelCost / m1Expenses) * 100 : 0, behavior: "Scales with miles and fuel price volatility" },
                  { cat: "Vehicle Financing (M1)", amt: 0, pct: 0, behavior: "Activates when new vehicles are acquired; $0 in Month 1" },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td className="py-2 px-3 font-medium">{row.cat}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(row.amt)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmtPct(row.pct)}</td>
                    <td className="py-2 px-3 text-muted-foreground">{row.behavior}</td>
                  </tr>
                ))}
                <tr className="bg-muted/30 font-bold">
                  <td className="py-2 px-3">Total</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(m1Expenses)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">100.0%</td>
                  <td className="py-2 px-3" />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Per-mile cost waterfall */}
          <SubSection label="Per-Mile Cost Waterfall" />
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="py-2 px-3 text-left font-semibold">Expense Item</th>
                  <th className="py-2 px-3 text-right font-semibold">Type</th>
                  <th className="py-2 px-3 text-right font-semibold">Cost/Mile</th>
                </tr>
              </thead>
              <tbody>
                {perMileRows.map((row, i) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1.5 px-3 text-muted-foreground">{row.name}</td>
                    <td className="py-1.5 px-3 text-right text-muted-foreground">{row.type}</td>
                    <td className="py-1.5 px-3 text-right tabular-nums">{fmtD(row.cpm)}/mi</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary comparisons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            {[
              { label: "Total Cost/Mile", value: fmtD(costPerMile) + "/mi", color: "bg-red-50 border-red-200" },
              { label: "Revenue/Mile", value: fmtD(revenuePerMile) + "/mi", color: "bg-green-50 border-green-200" },
              { label: "BEP Rate/Mile", value: fmtD(breakEvenRatePerMile) + "/mi", color: "bg-amber-50 border-amber-200" },
            ].map((item, i) => (
              <div key={i} className={`p-3 rounded-lg border ${item.color}`}>
                <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                <p className="text-base font-bold tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>

          {/* Vehicle financing note */}
          <div className="p-3 bg-muted/30 border border-border rounded-lg text-xs">
            <p className="font-semibold mb-1">Vehicle Financing (Not in Month 1 Baseline)</p>
            <p className="text-muted-foreground">
              Truck down payment: <strong>{fmt(truckDownPayment)} per vehicle</strong> (one-time, at acquisition). Monthly lease: <strong>{fmt(monthlyLeasePayment)}/vehicle/mo</strong> for each vehicle beyond the initial existing asset.
              At current 1-driver configuration with the existing truck, vehicle financing cost = <strong>$0/mo</strong>.
              These costs activate automatically when mile growth triggers additional driver/vehicle requirements (1 driver per 10,000 miles).
            </p>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 6: VEHICLE FINANCING & FLEET ACQUISITION
        ══════════════════════════════════════════════════════════════ */}
        <Section num="6" title="Vehicle Financing & Fleet Acquisition">
          <p className="text-sm text-foreground leading-relaxed mb-4">
            {businessName} currently operates {fleetSize} existing vehicle{fleetSize !== 1 ? "s" : ""} at no additional financing cost — the initial truck is treated as a paid asset, and no lease or down payment is applied in Month 1.
            The model automatically projects vehicle acquisition costs when mile volume growth requires additional drivers and vehicles.
            Fleet expansion follows a simple rule: 1 driver per 10,000 miles of monthly capacity.
            Each additional vehicle requires a one-time down payment of <strong>{fmt(truckDownPayment)}</strong> and generates an ongoing monthly lease of <strong>{fmt(monthlyLeasePayment)}/mo</strong>.
          </p>

          {/* Key parameters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="p-3 bg-muted/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Fleet Trigger Rule</p>
              <p className="font-bold">1 driver / 10,000 mi</p>
            </div>
            <div className="p-3 bg-muted/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Down Payment / Vehicle</p>
              <p className="font-bold tabular-nums">{fmt(truckDownPayment)}</p>
            </div>
            <div className="p-3 bg-muted/30 border border-border rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Monthly Lease / Vehicle</p>
              <p className="font-bold tabular-nums">{fmt(monthlyLeasePayment)}/mo</p>
            </div>
          </div>

          {/* 12-month schedule */}
          <SubSection label="12-Month Vehicle Financing Schedule" />
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="py-2 px-3 text-left font-semibold">Month</th>
                  <th className="py-2 px-3 text-right font-semibold">Miles</th>
                  <th className="py-2 px-3 text-right font-semibold">Drivers</th>
                  <th className="py-2 px-3 text-right font-semibold">New Vehicles</th>
                  <th className="py-2 px-3 text-right font-semibold">Down Payment</th>
                  <th className="py-2 px-3 text-right font-semibold">Lease This Mo</th>
                  <th className="py-2 px-3 text-right font-semibold">Cumulative Lease</th>
                </tr>
              </thead>
              <tbody>
                {vehicleSchedule.map((row, i) => {
                  cumulativeLease += row.lease;
                  const hasActivity = row.newVehicles > 0 || row.lease > 0 || row.downPayment > 0;
                  return (
                    <tr key={i} className={`border-b border-border/30 ${hasActivity ? "bg-amber-50/50" : ""}`}>
                      <td className="py-1.5 px-3 font-medium">Month {row.month}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.miles.toLocaleString()}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.drivers}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.newVehicles > 0 ? <strong>{row.newVehicles}</strong> : "—"}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.downPayment > 0 ? fmt(row.downPayment) : "—"}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{row.lease > 0 ? fmt(row.lease) : "—"}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{cumulativeLease > 0 ? fmt(cumulativeLease) : "—"}</td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/30 font-bold border-t-2 border-border">
                  <td className="py-2 px-3" colSpan={4}>12-Month Totals</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(totalDownPayments)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(totalLeasePayments)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(totalDownPayments + totalLeasePayments)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
            <p className="font-semibold text-blue-900 mb-1">Important Note for Lenders</p>
            <p className="text-blue-800">
              Vehicle acquisition costs are excluded from Month 1 and the operating expense baseline — they represent incremental capital requirements triggered only when growth milestones are reached.
              Total projected vehicle financing commitment over 12 months (Base Case): <strong>{fmt(totalDownPayments + totalLeasePayments)}</strong>
              ({fmt(totalDownPayments)} in down payments + {fmt(totalLeasePayments)} in lease obligations).
              This commitment is contingent on the business achieving the projected mile volume growth targets.
            </p>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 7: FUEL EXPOSURE & UNIT ECONOMICS
        ══════════════════════════════════════════════════════════════ */}
        <Section num="7" title="Fuel Exposure & Unit Economics">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Gas Price/Gal (Live)", value: fmtD(costPerGallon), sub: gasPriceSource ?? "Market rate" },
              { label: "Gal/Vehicle/Mo", value: Math.round(gallonsPerMonth).toLocaleString(), sub: `${avgMpg} MPG average` },
              { label: "Fuel Cost M1", value: fmt(monthlyFuelCost), sub: "Per vehicle/month" },
              { label: "Fuel % of Expenses", value: fmtPct(m1Expenses > 0 ? (monthlyFuelCost / m1Expenses) * 100 : 0), sub: "Month 1 share" },
              { label: "Cost/Mile (All-In)", value: fmtD(costPerMile) + "/mi", sub: "Incl. fixed allocation" },
              { label: "Revenue/Mile", value: fmtD(revenuePerMile) + "/mi", sub: "Blended rate" },
              { label: "Spread/Mile", value: fmtD(surplusRatePerMile) + "/mi", sub: "Above BEP" },
              { label: "BEP Rate/Mile", value: fmtD(breakEvenRatePerMile) + "/mi", sub: "Minimum viable rate" },
            ].map((item, i) => (
              <div key={i} className="p-3 rounded-lg border bg-muted/30 border-border">
                <p className="text-xs text-muted-foreground mb-1">{item.label}</p>
                <p className="text-base font-bold tabular-nums">{item.value}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>

          {/* Fuel sensitivity */}
          <SubSection label="Fuel Price Sensitivity" />
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="py-2 px-3 text-left font-semibold">Scenario</th>
                  <th className="py-2 px-3 text-right font-semibold">Price/Gal</th>
                  <th className="py-2 px-3 text-right font-semibold">Fuel Cost/Vehicle/Mo</th>
                  <th className="py-2 px-3 text-right font-semibold">Change vs Base</th>
                  <th className="py-2 px-3 text-right font-semibold">At Peak Fleet ({peakDrivers} veh)</th>
                  <th className="py-2 px-3 text-right font-semibold">Annual Exposure</th>
                </tr>
              </thead>
              <tbody>
                {[...fuelSensDeltas.map((d) => d), 0].sort((a, b) => a - b).map((delta, i) => {
                  const price = costPerGallon + delta;
                  const cost = gallonsPerMonth * price;
                  const change = cost - monthlyFuelCost;
                  const peakCost = cost * peakDrivers;
                  const annualExposure = change * 12 * peakDrivers;
                  const isBase = delta === 0;
                  return (
                    <tr key={i} className={`border-b border-border/40 ${isBase ? "bg-primary/5 font-semibold" : ""}`}>
                      <td className="py-2 px-3">{isBase ? "Base (Current)" : delta > 0 ? `+${fmtD(Math.abs(delta))} spike` : `${fmtD(Math.abs(delta))} drop`}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmtD(price)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(cost)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${delta > 0 ? "text-red-600" : delta < 0 ? "text-green-700" : ""}`}>
                        {isBase ? "—" : `${delta > 0 ? "+" : ""}${fmt(change)}`}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{fmt(peakCost)}</td>
                      <td className={`py-2 px-3 text-right tabular-nums ${delta > 0 ? "text-red-600" : delta < 0 ? "text-green-700" : ""}`}>
                        {isBase ? "—" : `${delta > 0 ? "+" : ""}${fmt(annualExposure)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Fuel surcharge analysis */}
          {jobTypes.some((j: any) => (j.fuelSurchargePerMile ?? 0) > 0) && (
            <>
              <SubSection label="Fuel Surcharge Offset Analysis" />
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="py-2 px-3 text-left font-semibold">Job Type</th>
                      <th className="py-2 px-3 text-right font-semibold">Fuel Surch./Mi</th>
                      <th className="py-2 px-3 text-right font-semibold">Miles/Mo</th>
                      <th className="py-2 px-3 text-right font-semibold">Monthly Offset</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobTypes.map((j: any, i: number) => {
                      const allocMiles = totalMilesPerMonth * (j.jobMixPct / 100);
                      const offset = (j.fuelSurchargePerMile ?? 0) * allocMiles;
                      return (
                        <tr key={i} className="border-b border-border/30">
                          <td className="py-1.5 px-3">{j.name}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{fmtD(j.fuelSurchargePerMile ?? 0)}/mi</td>
                          <td className="py-1.5 px-3 text-right tabular-nums">{Math.round(allocMiles).toLocaleString()}</td>
                          <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{fmt(offset)}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-muted/30 font-bold">
                      <td className="py-2 px-3" colSpan={3}>Total Monthly Fuel Surcharge Offset</td>
                      <td className="py-2 px-3 text-right tabular-nums">
                        {fmt(jobTypes.reduce((s: number, j: any) => s + (j.fuelSurchargePerMile ?? 0) * totalMilesPerMonth * (j.jobMixPct / 100), 0))}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 8: BREAK-EVEN & COVERAGE ANALYSIS
        ══════════════════════════════════════════════════════════════ */}
        <Section num="8" title="Break-Even & Coverage Analysis">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* 7A: BEP */}
            <div>
              <SubSection label="7A — Break-Even Point (BEP)" />
              <p className="text-xs text-muted-foreground mb-3">
                The break-even point is the minimum revenue level at which total costs are exactly covered — i.e., net profit = $0.
                Formula: <strong>BEP Revenue = Fixed Costs ÷ Contribution Margin Ratio</strong>.
                Running above BEP generates profit; running below BEP generates losses.
                BEP also translates to a minimum effective rate per mile that must be achieved across all service lines.
              </p>
              <div className="h-44 mb-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bepChartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                    <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 9 }} />
                    <Tooltip formatter={(v: any) => [fmt(v), ""]} />
                    <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]}>
                      {bepChartData.map((_: any, index: number) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="p-3 bg-muted/30 border border-border rounded-lg text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Fixed Costs</span><span className="tabular-nums font-semibold">{fmt(totalFixed)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Contribution Margin Ratio</span><span className="tabular-nums font-semibold">{fmtPct(cmRatio * 100)}</span></div>
                <div className="flex justify-between border-t border-border/40 pt-1"><span className="font-bold">BEP Revenue</span><span className="tabular-nums font-bold">{fmt(breakEvenRevenue)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Current Revenue (M1)</span><span className="tabular-nums">{fmt(m1Revenue)}</span></div>
                <div className={`flex justify-between font-bold ${m1Revenue >= breakEvenRevenue ? "text-green-700" : "text-red-600"}`}>
                  <span>Surplus / (Shortfall)</span>
                  <span className="tabular-nums">{fmt(m1Revenue - breakEvenRevenue)}</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">BEP Rate/Mile</span><span className="tabular-nums">{fmtD(breakEvenRatePerMile)}/mi</span></div>
              </div>
            </div>

            {/* 7B: FCCR */}
            <div>
              <SubSection label="7B — Fixed Charge Coverage Ratio (FCCR)" />
              <p className="text-xs text-muted-foreground mb-3">
                FCCR measures the business's ability to cover all fixed financial obligations (debt service, leases, overhead) from operating income.
                Formula: <strong>FCCR = EBIT ÷ Total Fixed Charges</strong>.
                Lenders typically require FCCR ≥ 1.25 for approval; 1.0–1.24 is marginal; below 1.0 indicates inability to cover fixed charges.
              </p>
              {/* FCCR Gauge */}
              <div className="p-4 bg-muted/20 border border-border rounded-lg mb-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>0.0</span><span>1.0</span><span>1.25</span><span>2.0</span><span>3.0+</span>
                </div>
                <div className="relative h-4 bg-muted rounded-full overflow-hidden">
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all" style={{ width: `${fccrPct}%`, background: fccr >= 1.25 ? "hsl(160,50%,42%)" : fccr >= 1.0 ? "hsl(34,80%,50%)" : "hsl(350,55%,48%)" }} />
                  {/* Threshold markers */}
                  <div className="absolute inset-y-0 border-l-2 border-white/60" style={{ left: `${(1.0 / 3) * 100}%` }} />
                  <div className="absolute inset-y-0 border-l-2 border-white/80" style={{ left: `${(1.25 / 3) * 100}%` }} />
                </div>
                <div className="mt-2 text-center">
                  <span className={`text-2xl font-bold tabular-nums ${fccr >= 1.25 ? "text-green-700" : fccr >= 1.0 ? "text-amber-600" : "text-red-600"}`}>{fmtD(fccr, 2)}x</span>
                  <span className="text-xs text-muted-foreground ml-2">{fccr >= 1.25 ? "Strong — Lender Threshold Met" : fccr >= 1.0 ? "Marginal — Monitor Closely" : "Below Threshold — Review Required"}</span>
                </div>
              </div>
              <div className="p-3 bg-muted/30 border border-border rounded-lg text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">EBIT (Month 1)</span><span className="tabular-nums">{fmt(m1Revenue - totalVariable - monthlyFuelCost - totalFixed)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Fixed Charges</span><span className="tabular-nums">{fmt(totalFixed)}</span></div>
                <div className="flex justify-between border-t border-border/40 pt-1 font-bold"><span>FCCR</span><span className="tabular-nums">{fmtD(fccr, 2)}x</span></div>
                <div className="pt-1 text-muted-foreground space-y-0.5">
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" /><span>Below 1.00 — Cannot cover fixed charges</span></div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /><span>1.00–1.24 — Marginal / conditional approval</span></div>
                  <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /><span>1.25+ — Standard lender threshold</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* BEP vs FCCR comparison box */}
          <div className="mt-4 p-3 bg-muted/20 border border-border/60 rounded-lg grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-bold text-foreground mb-1">Break-Even Point answers:</p>
              <p className="text-muted-foreground">"What is the minimum revenue level I need to generate to cover all costs?" — Useful for pricing strategy, minimum load planning, and volume floor analysis.</p>
            </div>
            <div>
              <p className="font-bold text-foreground mb-1">FCCR answers:</p>
              <p className="text-muted-foreground">"Can I cover all my fixed financial obligations from operating income?" — This is the primary credit metric used by lenders and banks to assess repayment capacity.</p>
            </div>
          </div>

          {/* Per-job BEP table */}
          {jobTypes.length > 0 && (
            <>
              <SubSection label="Break-Even by Job Type" />
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-muted/40 text-muted-foreground">
                      <th className="py-2 px-3 text-left font-semibold">Job Type</th>
                      <th className="py-2 px-3 text-right font-semibold">Mix%</th>
                      <th className="py-2 px-3 text-right font-semibold">Miles/Mo</th>
                      <th className="py-2 px-3 text-right font-semibold">BEP Rate/Mi</th>
                      <th className="py-2 px-3 text-right font-semibold">Actual Rate/Mi</th>
                      <th className="py-2 px-3 text-right font-semibold">Surplus/Mi</th>
                      <th className="py-2 px-3 text-right font-semibold">Monthly Revenue</th>
                      <th className="py-2 px-3 text-right font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobTypes.map((j: any, i: number) => {
                      const allocMiles = totalMilesPerMonth * (j.jobMixPct / 100);
                      const bep = j.bepRatePerMile ?? breakEvenRatePerMile;
                      const actual = j.totalRatePerMile ?? j.computedRatePerMile ?? 0;
                      const surplus = j.surplusPerMile ?? (actual - bep);
                      const profitable = j.isProfitable ?? surplus >= 0;
                      return (
                        <tr key={i} className="border-b border-border/40">
                          <td className="py-2 px-3 font-medium">{j.name}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtPct(j.jobMixPct)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{Math.round(allocMiles).toLocaleString()}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtD(bep)}/mi</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmtD(actual)}/mi</td>
                          <td className={`py-2 px-3 text-right tabular-nums font-semibold ${surplus >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtD(surplus)}/mi</td>
                          <td className="py-2 px-3 text-right tabular-nums">{fmt(j.monthlyRevenue)}</td>
                          <td className={`py-2 px-3 text-right font-semibold ${profitable ? "text-green-700" : "text-red-600"}`}>{profitable ? "Profitable" : "Below BEP"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 9: 12-MONTH FINANCIAL PROJECTIONS
        ══════════════════════════════════════════════════════════════ */}
        <Section num="9" title="12-Month Financial Projections">
          <p className="text-sm text-foreground leading-relaxed mb-4">
            Three scenarios are modeled: <strong>Base Case</strong> (current trajectory with configured growth), <strong>Best Case</strong> (accelerated growth / higher rates), and <strong>Worst Case</strong> (conservative volume assumptions).
            Each scenario scales revenue, variable costs, and fleet requirements proportionally, while fixed costs remain stable within each fleet tier.
            Month 1 represents the 1-vehicle, 1-driver baseline; subsequent months reflect incremental mile growth and any triggered fleet expansions.
            These projections are intended to inform lender expectations around revenue sustainability, peak financing need, and repayment capacity.
          </p>

          {/* Miles & Driver growth table */}
          <SubSection label="Miles & Driver Growth Schedule — Base Case" />
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="py-2 px-3 text-left font-semibold">Month</th>
                  <th className="py-2 px-3 text-right font-semibold">Miles</th>
                  <th className="py-2 px-3 text-right font-semibold">Drivers</th>
                  <th className="py-2 px-3 text-right font-semibold">New Drivers</th>
                  <th className="py-2 px-3 text-right font-semibold">Ramp Month?</th>
                  <th className="py-2 px-3 text-right font-semibold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 12 }, (_, i) => {
                  const m = baseMonths[i] ?? {};
                  const drivers = driversByMonth[i] ?? 1;
                  const prevDrivers = i === 0 ? 1 : (driversByMonth[i - 1] ?? 1);
                  const newDrivers = Math.max(0, drivers - prevDrivers);
                  const isRamp = rampMonthIndices.includes(i);
                  const miles = milesByMonth[i] ?? totalMilesPerMonth;
                  return (
                    <tr key={i} className={`border-b border-border/30 ${isRamp ? "bg-amber-50/40" : ""}`}>
                      <td className="py-1.5 px-3 font-medium">Month {i + 1}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{miles.toLocaleString()}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{drivers}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{newDrivers > 0 ? <strong>+{newDrivers}</strong> : "—"}</td>
                      <td className="py-1.5 px-3 text-right">{isRamp ? <span className="text-amber-700 font-semibold">Ramp</span> : "—"}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmt(m.revenue ?? 0)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Revenue/P&L projection table */}
          <SubSection label="Monthly Revenue & P&L — Base Case" />
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="py-2 px-3 text-left font-semibold">Mo</th>
                  <th className="py-2 px-3 text-right font-semibold">Mi</th>
                  <th className="py-2 px-3 text-right font-semibold">Dr</th>
                  <th className="py-2 px-3 text-right font-semibold">Revenue</th>
                  <th className="py-2 px-3 text-right font-semibold">Var Costs</th>
                  <th className="py-2 px-3 text-right font-semibold">Fixed</th>
                  <th className="py-2 px-3 text-right font-semibold">Lease</th>
                  <th className="py-2 px-3 text-right font-semibold">Down Pmt</th>
                  <th className="py-2 px-3 text-right font-semibold">EBIT</th>
                  <th className="py-2 px-3 text-right font-semibold">Net Profit</th>
                  <th className="py-2 px-3 text-right font-semibold">Margin</th>
                </tr>
              </thead>
              <tbody>
                {baseMonths.map((m: any, i: number) => {
                  const revenue = m.revenue ?? 0;
                  const opEx = m.operatingExpenses ?? m.expenses ?? 0;
                  const lease = m.leasePayment ?? vehicleSchedule[i]?.lease ?? 0;
                  const downPmt = m.downPayment ?? vehicleSchedule[i]?.downPayment ?? 0;
                  const ebit = m.ebit ?? (revenue - opEx);
                  const profit = m.profit ?? 0;
                  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
                  const drivers = driversByMonth[i] ?? 1;
                  const miles = milesByMonth[i] ?? totalMilesPerMonth;
                  // Rough variable vs fixed split
                  const varCosts = m.fuelCost != null ? (opEx - (m.leasePayment ?? 0)) * ((totalVariable + monthlyFuelCost) / (m1Expenses || 1)) : 0;
                  return (
                    <tr key={i} className={`border-b border-border/30 ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                      <td className="py-1.5 px-3 font-medium">M{i + 1}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{(miles / 1000).toFixed(1)}k</td>
                      <td className="py-1.5 px-3 text-right tabular-nums text-muted-foreground">{drivers}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums font-semibold">{fmt(revenue)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmt(m.fuelCost ?? (monthlyFuelCost + totalVariable))}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmt(totalFixed * drivers)}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{lease > 0 ? fmt(lease) : "—"}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{downPmt > 0 ? fmt(downPmt) : "—"}</td>
                      <td className="py-1.5 px-3 text-right tabular-nums">{fmt(ebit)}</td>
                      <td className={`py-1.5 px-3 text-right tabular-nums font-semibold ${profit >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(profit)}</td>
                      <td className={`py-1.5 px-3 text-right tabular-nums ${margin >= 0 ? "text-green-700" : "text-red-600"}`}>{fmtPct(margin)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-muted/30 font-bold border-t-2 border-border">
                  <td className="py-2 px-3" colSpan={3}>12-Month Total</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(trueAnnualRevenue)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">—</td>
                  <td className="py-2 px-3 text-right tabular-nums">—</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(totalLeasePayments)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(totalDownPayments)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">—</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmt(trueAnnualProfit)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{fmtPct(trueAnnualMargin)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Revenue projection chart */}
          <SubSection label="Revenue Projection — All Scenarios" />
          <div className="h-56 mb-5">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scenarioChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: any, name: string) => [fmt(v), name]} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {scenarioProjections?.map((s: any, i: number) => (
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    strokeWidth={s.name === "Base Case" ? 2.5 : 1.5}
                    strokeDasharray={s.name === "Worst Case" ? "4 4" : s.name === "Best Case" ? "6 2" : undefined}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Annual scenario summary */}
          <SubSection label="Annual Scenario Summary" />
          <div className="overflow-x-auto mb-5">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-muted/40 text-muted-foreground">
                  <th className="py-2 px-3 text-left font-semibold">Scenario</th>
                  <th className="py-2 px-3 text-right font-semibold">Annual Revenue</th>
                  <th className="py-2 px-3 text-right font-semibold">Annual Expenses</th>
                  <th className="py-2 px-3 text-right font-semibold">Annual EBIT</th>
                  <th className="py-2 px-3 text-right font-semibold">Annual Net Profit</th>
                  <th className="py-2 px-3 text-right font-semibold">Net Margin</th>
                </tr>
              </thead>
              <tbody>
                {scenarioSummary.map((s: any, i: number) => (
                  <tr key={i} className={`border-b border-border/40 ${s.name === "Base Case" ? "bg-primary/5 font-semibold" : ""}`}>
                    <td className="py-2 px-3 font-medium">{s.name}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(s.rev)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(s.exp)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(s.ebit)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${s.pft >= 0 ? "text-green-700" : "text-red-600"}`}>{fmt(s.pft)}</td>
                    <td className={`py-2 px-3 text-right tabular-nums ${s.margin >= 0 ? "" : "text-red-600"}`}>{fmtPct(s.margin)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Scenario methodology */}
          <div className="p-3 bg-muted/30 border border-border rounded-lg text-xs">
            <p className="font-semibold mb-2">Scenario Methodology</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { name: "Worst Case", desc: "Conservative volume assumptions — typically 70-80% of base miles, lower effective rates due to market pressure, reduced job type mix diversity." },
                { name: "Base Case", desc: "Current configured trajectory — reflects the business model as set up, with incremental mile growth and proportional cost scaling." },
                { name: "Best Case", desc: "Accelerated growth scenario — higher mile volume, improved rates (better job mix, market premiums), and faster fleet ramp-up." },
              ].map((s, i) => (
                <div key={i} className="p-2 bg-background rounded border border-border/60">
                  <p className="font-semibold mb-1" style={{ color: CHART_COLORS[i === 0 ? 3 : i === 1 ? 0 : 2] }}>{s.name}</p>
                  <p className="text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 10: RISK FACTORS & MITIGANTS
        ══════════════════════════════════════════════════════════════ */}
        <Section num="10" title="Risk Factors & Mitigants">
          <p className="text-sm text-muted-foreground mb-4">
            The following risk factors are presented in the interest of full disclosure and informed lending. Each risk is accompanied by a quantified exposure estimate and proposed mitigant.
          </p>
          <div className="space-y-3">
            {[
              {
                num: "1",
                risk: "Fuel Price Volatility",
                detail: `A $0.50/gallon swing in fuel price translates to approximately ${fmt(gallonsPerMonth * 0.50)}/vehicle/month in additional fuel cost, or ${fmt(gallonsPerMonth * 0.50 * peakDrivers * 12)} annually at peak fleet of ${peakDrivers} vehicles. Fuel currently represents ${fmtPct(m1Expenses > 0 ? (monthlyFuelCost / m1Expenses) * 100 : 0)} of Month 1 expenses.`,
                mitigant: "Partial offset via fuel surcharge pricing built into each service line rate. Surcharges can be adjusted as market conditions change. Live gas price integration ensures real-time cost accuracy.",
              },
              {
                num: "2",
                risk: "Miles Volume Risk",
                detail: `If total monthly miles fall short of the ${totalMilesPerMonth.toLocaleString()} target, fixed costs remain constant while revenue decreases. A 20% shortfall (${Math.round(totalMilesPerMonth * 0.8).toLocaleString()} miles) would reduce Month 1 revenue by approximately ${fmt(m1Revenue * 0.2)} while fixed overhead of ${fmt(totalFixed)} continues.`,
                mitigant: "Rate-per-mile model ensures that every mile run contributes positively above the BEP rate. Variable costs contract with volume, partially cushioning the impact. Multiple service lines provide diversification against single-platform volume loss.",
              },
              {
                num: "3",
                risk: "Vehicle Acquisition Execution",
                detail: `Each new driver triggered by growth requires a vehicle with a ${fmt(truckDownPayment)} down payment and ${fmt(monthlyLeasePayment)}/mo ongoing lease. Failure to secure vehicles on schedule would limit revenue at the projected growth rate, creating a capital availability dependency at each fleet milestone.`,
                mitigant: `This report projects total vehicle financing needs of ${fmt(totalDownPayments + totalLeasePayments)} over 12 months (Base Case). Pre-arranging fleet financing prior to growth triggers eliminates acquisition lag. Vehicle acquisition is explicitly tied to growth milestones, not baseline operations.`,
              },
              {
                num: "4",
                risk: "Revenue Concentration",
                detail: "Logistics businesses dependent on platform assignments (FedEx, UPS, USPS, Amazon) or government contracts face concentration risk. Loss of a single platform contract can disproportionately impact revenue if it represents >30% of volume.",
                mitigant: "Job type diversification across service lines reduces single-platform dependency. Rate architecture allows rapid repricing if one platform becomes less competitive. Geographic and platform mix should be actively managed as the fleet scales.",
              },
              {
                num: "5",
                risk: "Driver Availability & Retention",
                detail: `Each driver represents ${(10000).toLocaleString()} miles of monthly capacity and proportional revenue. Losing a driver at full fleet = losing approximately ${fmt(m1Revenue)} in monthly revenue (at current per-driver rate). Driver turnover also triggers replacement recruitment, training, and potential downtime costs.`,
                mitigant: "Competitive compensation structured into the variable cost model. Ramp month modeling accounts for onboarding lag. Fleet expansion tied to demonstrated volume, not speculative hiring.",
              },
              {
                num: "6",
                risk: "Vehicle Maintenance & Downtime",
                detail: `An out-of-service vehicle eliminates its proportional daily revenue. At ${fmt(m1Revenue)} monthly revenue with 1 vehicle, daily at-risk revenue is approximately ${fmt(m1Revenue / 30)}. A 5-day maintenance event represents ${fmt((m1Revenue / 30) * 5)} in lost revenue while fixed costs continue.`,
                mitigant: "Preventive maintenance schedules reduce unplanned downtime. Multi-vehicle fleet (as it grows) provides partial redundancy. Variable costs do not accrue during downtime, partially offsetting fixed overhead impact.",
              },
              {
                num: "7",
                risk: "Regulatory & Compliance",
                detail: "DOT licensing, HAZMAT certifications, hours-of-service regulations, and commercial vehicle inspection requirements create ongoing compliance obligations. Non-compliance can result in operational shutdowns, fines, or loss of platform contracts.",
                mitigant: "Compliance costs are captured within the fixed overhead structure. State-specific regulatory costs ({stateCode}) are reflected in the financial model. Ongoing compliance monitoring is a standard operating cost for licensed carriers.",
              },
              {
                num: "8",
                risk: "Lease & Financing Obligations",
                detail: `Monthly vehicle lease payments of ${fmt(monthlyLeasePayment)}/vehicle represent a fixed obligation that persists regardless of revenue performance. At peak fleet, total monthly lease commitment could reach ${fmt(monthlyLeasePayment * peakDrivers)}/mo. These obligations cannot be deferred during low-volume periods.`,
                mitigant: "Lease payments are contingent on fleet growth milestones — the baseline obligation is $0/mo for the existing vehicle. Growth-triggered leases are offset by proportional revenue increases. FCCR modeling explicitly accounts for lease payments in fixed charge coverage calculations.",
              },
            ].map((item) => (
              <div key={item.num} className="p-3 bg-muted/20 border border-border/60 rounded-lg">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 text-xs font-bold text-primary flex items-center justify-center">{item.num}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm text-foreground mb-1">{item.risk}</p>
                    <p className="text-xs text-muted-foreground mb-2">{item.detail}</p>
                    <div className="flex items-start gap-1.5">
                      <span className="text-xs font-bold text-green-700 flex-shrink-0">Mitigant:</span>
                      <p className="text-xs text-green-800">{item.mitigant}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ══════════════════════════════════════════════════════════════
            SECTION 11: USE OF PROCEEDS
        ══════════════════════════════════════════════════════════════ */}
        <UseOfProceedsSection
          businessName={businessName}
          initialValue={settings?.useOfProceeds ?? ""}
        />

        {/* ══════════════════════════════════════════════════════════════
            FOOTER
        ══════════════════════════════════════════════════════════════ */}
        <div className="mt-12 pt-4 border-t-2 border-border text-xs text-muted-foreground flex flex-col sm:flex-row justify-between gap-2">
          <div>
            <p className="font-semibold text-foreground">{businessName}</p>
            <p>{stateCode} &bull; {today}</p>
            <p>Fuel price source: {gasPriceSource ?? "Market"} &bull; {fmtD(costPerGallon)}/gal</p>
          </div>
          <div className="text-right">
            <p className="font-semibold text-primary">Generated by a SYNQ Application</p>
            <p className="text-muted-foreground/70 text-xs mt-0.5">For financing and investment review purposes only.</p>
            <p className="text-muted-foreground/70 text-xs">Projections are forward-looking and subject to change.</p>
          </div>
        </div>

      </div>
    </>
  );
}
