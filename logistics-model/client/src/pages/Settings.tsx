import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import React, { useState, useEffect, useMemo } from "react";
import { Save, Plus, Trash2, Pencil, Check, X, TrendingUp, Info, Truck } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ── SpinInput ── number input with manual typing, scroll wheel, and +/− buttons
function SpinInput({
  value, onChange, step = 1, min, max, prefix, suffix, className = "", testId,
}: {
  value: number; onChange: (v: number) => void;
  step?: number; min?: number; max?: number;
  prefix?: string; suffix?: string;
  className?: string; testId?: string;
}) {
  const [raw, setRaw] = React.useState(String(value));
  React.useEffect(() => { setRaw(String(value)); }, [value]);

  const clamp = (v: number) => {
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (!isNaN(n)) { const c = clamp(n); onChange(c); setRaw(String(c)); }
    else setRaw(String(value));
  };

  const nudge = (dir: 1 | -1) => {
    const next = clamp(parseFloat(raw || '0') + dir * step);
    onChange(next);
    setRaw(String(next));
  };

  return (
    <div className={`flex items-center rounded-md border border-input bg-background overflow-hidden ${className}`}>
      {prefix && <span className="pl-2.5 text-xs text-muted-foreground select-none">{prefix}</span>}
      <input
        type="number"
        className="flex-1 min-w-0 px-2 py-1.5 text-sm bg-transparent outline-none tabular-nums
          [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        value={raw}
        data-testid={testId}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(raw);
          if (e.key === 'ArrowUp') { e.preventDefault(); nudge(1); }
          if (e.key === 'ArrowDown') { e.preventDefault(); nudge(-1); }
        }}
        onWheel={(e) => { e.preventDefault(); nudge(e.deltaY < 0 ? 1 : -1); }}
      />
      {suffix && <span className="pr-1 text-xs text-muted-foreground select-none">{suffix}</span>}
      <div className="flex flex-col border-l border-border">
        <button
          type="button"
          onClick={() => nudge(1)}
          className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 text-[10px] leading-none"
          tabIndex={-1}
        >▲</button>
        <button
          type="button"
          onClick={() => nudge(-1)}
          className="px-1.5 py-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 text-[10px] leading-none border-t border-border"
          tabIndex={-1}
        >▼</button>
      </div>
    </div>
  );
}

// ── InfoTip ── hover tooltip for any input label
function InfoTip({ content }: { content: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="inline w-3 h-3 ml-1 text-muted-foreground/50 hover:text-primary cursor-help flex-shrink-0 translate-y-[-1px]" />
        </TooltipTrigger>
        <TooltipContent side="top" align="start" className="max-w-[280px] text-xs leading-relaxed z-50">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── FieldLabel ── label + tooltip in one
function FieldLabel({ children, tip, size = "sm" }: { children: React.ReactNode; tip: string; size?: "xs" | "sm" }) {
  return (
    <Label className={`text-${size} flex items-center gap-0`}>
      {children}
      <InfoTip content={tip} />
    </Label>
  );
}

// ────────────────────────────────────────────────────────────
const TIPS = {
  // Business & Fleet
  truckDownPayment: "One-time cost per vehicle when a new driver/truck joins the fleet. Applied in Month 1 for the initial fleet, and again whenever headcount increases. Includes down payment or initial acquisition cost. Cargo van typical range: $2,000–$10,000 depending on lease structure.",
  monthlyLeasePayment: "Recurring monthly lease or financing payment per vehicle. Increases automatically when the driver count grows. Does not include fuel, insurance, or maintenance — those are tracked separately. Cargo van typical range: $500–$1,200/month.",
  businessName: "Your legal business name. Appears on all reports and financing documents presented to lenders and investors.",
  state: "Your primary operating state. Used to pull live, state-specific regular gasoline prices from AAA. Fuel is calculated as a direct variable cost in the model.",
  fleetSize: "Number of active vehicles/drivers in Month 1 (your starting fleet). Additional drivers are managed via the Fleet Growth Timeline — costs and revenue scale automatically when milestones are added.",
  avgMpg: "Average fuel efficiency of your cargo van. Used to calculate monthly fuel cost: (Total Miles ÷ MPG) × Gas Price/gallon. Most cargo vans average 18–22 MPG. Gasoline rate fetched live from AAA.",
  revenueGrowthRate: "Annual percentage increase applied to projected revenue in scenarios. Compounded monthly (÷12). Industry average for small logistics: 2–5%/year. Affects Best/Base/Worst Case projections.",

  // Fleet Growth Timeline
  milestoneMonth: "The month (1–12) when the fleet change takes effect. Fleet size holds at this level until your next milestone. Month 1 starts at your base fleet size (set in Business & Fleet above).",
  milestoneFleet: "Total number of active drivers/vehicles from this month forward. Each driver brings their own vehicle — revenue, fuel, maintenance, tolls, meals, driver pay, and insurance all multiply by fleet size at this month.",
  milestoneNote: "Optional label shown in the Monthly P&L header row and the Report's Staffing Plan table, so lenders can identify each hiring event clearly.",

  // Revenue Model — global
  flatRevenue: "Flat monthly revenue used when the Rate Model is OFF. This is a manual override — the model does not compute it from job types. Use the Rate Model (toggle ON) for a more accurate bottom-up calculation.",
  marginTarget: "Target profit margin applied to ALL job types. Formula: Rate = Base Rate × (1 + Margin) × other factors. Healthy logistics operations target 15–25%. Premium or niche lanes can reach 25–40%.",
  marketFactor: "Supply & demand adjustment applied to all jobs. Weak market (excess capacity): −10% to −30% | Balanced market: 0–10% | Tight capacity (high demand): +10–40%. Often the biggest rate swing variable.",

  // Job Type fields
  jtBaseRate: "Starting rate per mile before any adjustments. Industry benchmarks (2025): Dry van spot $1.80–2.50/mi | Contract freight $2.20–3.00/mi | Specialized/expedited $3.00–5.00+/mi.",
  jtMilesPerRun: "Average one-way miles per delivery for this job type. Multiplied by Runs/Month to get this job type's total monthly miles, which drives fuel cost and per-mile variable expenses.",
  jtRunsPerMonth: "Derived automatically from Total Miles × Job Mix % ÷ Avg Miles per Run. You no longer enter runs directly — set your total miles and job mix % instead.",
  jtJobMixPct: "This job type's share of total monthly miles as a percentage. All job types must sum to 100%. Example: FedEx = 20%, E-Commerce = 25%, Platform Parcel = 45%, etc. The model allocates miles proportionally and derives runs, revenue, and costs for each job type.",
  jtComplexity: "Additional rate premium for load difficulty. Standard freight: 0% | Heavy/overweight: +10–25% | Oversized/specialized equipment: +20–50% | Fragile or high-liability cargo: +5–15% | Multi-stop loads: +5–20%.",
  jtUrgency: "Rate premium for time-sensitive deliveries. Standard freight: 0% | Tight delivery window: +10–30% | Same-day / hotshot: +30–100%. Only apply if this job type is regularly expedited.",
  jtDeadhead: "Percentage of total miles driven empty (unpaid return trips). Industry standard: 10–20% of total miles. Deadhead effectively raises your real cost per mile since you pay fuel but earn no revenue on those miles.",
  jtFuelSurcharge: "Per-mile fuel surcharge billed to the customer on top of the base rate. Typically $0.30–0.80/mi and passed through to offset fuel price volatility. Added to every billable (non-deadhead) mile.",
  jtAccessorial: "Flat fee charged per delivery for extras such as detention ($50–100/hr when waiting), layover ($150–300/day for overnight), stop-off fees ($50–150/extra stop), or toll reimbursement (100% pass-through).",

  // Expenses
  expenseName: "Descriptive name for this expense as it will appear on reports. Be specific — e.g. 'Insurance — Vehicle' rather than just 'Insurance'.",
  expenseCategory: "Fixed: does not change with miles driven (e.g. insurance, software subscriptions). Variable: scales with miles — enter a $/mile rate so it adjusts automatically when fleet size or job types change.",
  expenseRatePerMile: "Cost per mile driven. The model multiplies this by total monthly miles to compute the expense. Industry benchmarks: Driver pay $0.38–0.52/mi | Fuel (live) | Maintenance $0.05–0.07/mi | Tires $0.01–0.02/mi.",
  expenseAmount: "Flat monthly dollar amount. Used for expenses that don't change with mileage (fixed) or as a fallback for variable expenses without a per-mile rate.",
  expenseSource: "Data source or benchmark used to set this rate. Shown on reports so lenders can verify the assumptions. Examples: IRS Pub. 463, BLS OES 2023, AAA fuel data, EasiTrack 2025.",
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC"
];

// Helper: parse a % string to decimal (e.g. "15" → 0.15)
const pct = (v: string) => (parseFloat(v) || 0) / 100;
const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
const fmtUSD = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Slider row component
function SliderRow({
  label, hint, value, min, max, step, suffix, onChange, benchmarkLow, benchmarkHigh, testId,
}: {
  label: string; hint: string; value: number; min: number; max: number; step: number;
  suffix: string; onChange: (v: number) => void;
  benchmarkLow?: number; benchmarkHigh?: number; testId?: string;
}) {
  const [inputVal, setInputVal] = useState(String(+(value * (suffix === "%" ? 100 : 1)).toFixed(2)));
  useEffect(() => {
    setInputVal(String(+(value * (suffix === "%" ? 100 : 1)).toFixed(suffix === "%" ? 1 : 2)));
  }, [value, suffix]);

  const displayVal = suffix === "%" ? value * 100 : value;
  const sliderPct = Math.min(Math.max(((displayVal - min) / (max - min)) * 100, 0), 100);

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (isNaN(n)) return;
    const clamped = Math.min(Math.max(n, min), max);
    onChange(suffix === "%" ? clamped / 100 : clamped);
    setInputVal(String(clamped));
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between">
        <div>
          <Label className="text-xs font-medium">{label}</Label>
          <p className="text-[10px] text-muted-foreground">{hint}</p>
          {benchmarkLow !== undefined && benchmarkHigh !== undefined && (
            <p className="text-[10px] text-primary/70 mt-0.5">
              Industry: {suffix === "%" ? `${benchmarkLow}%–${benchmarkHigh}%` : `$${benchmarkLow}–$${benchmarkHigh}`}
            </p>
          )}
        </div>
        <div className="relative w-20 flex-shrink-0">
          {suffix !== "%" && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>}
          <Input
            type="number"
            step={step}
            className={`h-7 text-xs text-right pr-1 ${suffix !== "%" ? "pl-5" : ""}`}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") commit(inputVal); }}
            data-testid={testId}
          />
          {suffix === "%" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>}
        </div>
      </div>
      {/* Track */}
      <div
        className="relative h-1.5 bg-muted rounded-full cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          const rawVal = min + ratio * (max - min);
          const stepped = Math.round(rawVal / step) * step;
          const clamped = Math.min(Math.max(stepped, min), max);
          onChange(suffix === "%" ? clamped / 100 : clamped);
          setInputVal(String(+clamped.toFixed(suffix === "%" ? 1 : 2)));
        }}
      >
        {/* Benchmark band */}
        {benchmarkLow !== undefined && benchmarkHigh !== undefined && (
          <div
            className="absolute top-0 h-full bg-primary/15 rounded-full"
            style={{
              left: `${((benchmarkLow - min) / (max - min)) * 100}%`,
              width: `${((benchmarkHigh - benchmarkLow) / (max - min)) * 100}%`,
            }}
          />
        )}
        {/* Fill */}
        <div className="absolute top-0 h-full bg-primary rounded-full" style={{ width: `${sliderPct}%` }} />
        {/* Thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-background border-2 border-primary rounded-full shadow"
          style={{ left: `${sliderPct}%` }}
        />
      </div>
    </div>
  );
}

// ── Job Types Section ────────────────────────────────────────────────────────────
function JobTypesSection({ form, setF, settingsMutation, hasMilestones }: { form: any; setF: (k: string, v: any) => void; settingsMutation: any; hasMilestones: boolean }) {
  const { toast } = useToast();
  const { data: jobTypesList = [], isLoading } = useQuery({
    queryKey: ["/api/job-types"],
    queryFn: () => apiRequest("GET", "/api/job-types").then((r) => r.json()),
  });

  const { data: summary } = useQuery({
    queryKey: ["/api/financial-summary"],
    queryFn: () => apiRequest("GET", "/api/financial-summary").then((r) => r.json()),
  });

  // hasMilestones is passed as a prop from parent

  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState<any>({});
  const [showAdd, setShowAdd] = useState(false);
  const [newJT, setNewJT] = useState({
    name: "", avgMilesPerRun: "200",
    jobMixPct: "20",
    complexityFactor: "0", urgencyFactor: "0", deadheadPct: "15",
    fuelSurchargePerMile: "0.45", accessorialPerRun: "0",
  });

  const addMut = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/job-types", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      setShowAdd(false);
      setNewJT({ name: "", avgMilesPerRun: "200", jobMixPct: "20", complexityFactor: "0", urgencyFactor: "0", deadheadPct: "15", fuelSurchargePerMile: "0.45", accessorialPerRun: "0" });
      toast({ title: "Job type added" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/job-types/${id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      setEditId(null);
      toast({ title: "Job type updated" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/job-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/job-types"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      toast({ title: "Job type removed" });
    },
  });

  const rm = summary?.revenueModel;
  const breakdown: any[] = rm?.jobTypeBreakdown ?? [];

  const startEdit = (jt: any) => {
    setEditId(jt.id);
    setEditData({
      name: jt.name,
      avgMilesPerRun: String(jt.avgMilesPerRun),
      jobMixPct: String(jt.jobMixPct ?? 20),
      complexityFactor: String((jt.complexityFactor * 100).toFixed(0)),
      urgencyFactor: String((jt.urgencyFactor * 100).toFixed(0)),
      deadheadPct: String((jt.deadheadPct * 100).toFixed(0)),
      fuelSurchargePerMile: String(jt.fuelSurchargePerMile),
      accessorialPerRun: String(jt.accessorialPerRun),
    });
  };

  const saveEdit = () => {
    if (!editId || !editData.name) return;
    updateMut.mutate({
      id: editId,
      data: {
        name: editData.name,
        baseRatePerMile: 2.40,
        avgMilesPerRun: parseFloat(editData.avgMilesPerRun) || 0,
        runsPerMonth: 0,
        jobMixPct: parseFloat(editData.jobMixPct) || 0,
        complexityFactor: (parseFloat(editData.complexityFactor) || 0) / 100,
        urgencyFactor: (parseFloat(editData.urgencyFactor) || 0) / 100,
        deadheadPct: (parseFloat(editData.deadheadPct) || 0) / 100,
        fuelSurchargePerMile: parseFloat(editData.fuelSurchargePerMile) || 0,
        accessorialPerRun: parseFloat(editData.accessorialPerRun) || 0,
      },
    });
  };

  const submitNew = () => {
    if (!newJT.name) return;
    addMut.mutate({
      name: newJT.name,
      baseRatePerMile: 2.40,
      avgMilesPerRun: parseFloat(newJT.avgMilesPerRun) || 200,
      runsPerMonth: 0,
      jobMixPct: parseFloat(newJT.jobMixPct) || 20,
      complexityFactor: (parseFloat(newJT.complexityFactor) || 0) / 100,
      urgencyFactor: (parseFloat(newJT.urgencyFactor) || 0) / 100,
      deadheadPct: (parseFloat(newJT.deadheadPct) || 0) / 100,
      fuelSurchargePerMile: parseFloat(newJT.fuelSurchargePerMile) || 0.45,
      accessorialPerRun: parseFloat(newJT.accessorialPerRun) || 0,
      isActive: true,
    });
  };

  // Field row helper — uses SpinInput for scroll + +/- support
  const Field = ({ label, value, onChange, suffix, width, step, tip }: any) => {
    const numVal = parseFloat(value) || 0;
    const stepNum = parseFloat(step) || (suffix === "%" ? 1 : 0.01);
    return (
      <div className={`space-y-0.5 ${width ?? "w-24"}`}>
        <Label className="text-[10px] text-muted-foreground flex items-center">
          {label}{tip && <InfoTip content={tip} />}
        </Label>
        <SpinInput
          value={numVal}
          onChange={(v) => onChange(String(v))}
          step={stepNum}
          min={suffix === "%" ? -100 : 0}
          max={suffix === "%" ? 200 : undefined}
          prefix={suffix === "$" ? "$" : undefined}
          suffix={suffix === "%" ? "%" : undefined}
          className="h-7 text-xs"
        />
      </div>
    );
  };

  return (
    <Card data-testid="card-job-types">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" />
              Job Types &amp; Revenue Model
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define your recurring delivery types. Revenue = sum of all job types. Toggle to use as the active revenue source.
            </p>
          </div>
          <button role="switch" aria-checked={form.useRateModel}
            onClick={() => { setF("useRateModel", !form.useRateModel); settingsMutation.mutate({ ...form, useRateModel: !form.useRateModel }); }}
            data-testid="toggle-rate-model"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.useRateModel ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${form.useRateModel ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        {form.useRateModel ? (
          <div className="mt-2 p-2 bg-primary/5 border border-primary/20 rounded text-xs text-primary">
            Revenue Model <strong>ON</strong> — monthly revenue is the sum of all job types below.
          </div>
        ) : (
          <div className="mt-2 p-2 bg-muted/30 border border-border rounded text-xs text-muted-foreground">
            Revenue Model <strong>OFF</strong> — using flat ${form.monthlyRevenue?.toLocaleString()}/mo.
            {" "}Adjust inputs below to preview what the model would produce.
            <div className="mt-1.5 flex gap-2 items-end">
              <div className="space-y-0.5">
                <FieldLabel size="xs" tip={TIPS.flatRevenue}>Flat Monthly Revenue ($)</FieldLabel>
                <Input type="number" className="h-7 text-xs w-32" value={form.monthlyRevenue}
                  onChange={(e: any) => setF("monthlyRevenue", parseFloat(e.target.value) || 0)} />
              </div>
            </div>
          </div>
        )}
        {/* Global margin & market factor */}
        <div className="mt-2 grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <FieldLabel size="xs" tip={TIPS.marginTarget}>Margin Target (% applied to all jobs)</FieldLabel>
            <Input type="number" step="1" className="h-7 text-xs" value={((form.marginTarget ?? 0) * 100).toFixed(0)}
              onChange={(e: any) => setF("marginTarget", (parseFloat(e.target.value) || 0) / 100)}
              onBlur={() => settingsMutation.mutate(form)} />
          </div>
          <div className="space-y-0.5">
            <FieldLabel size="xs" tip={TIPS.marketFactor}>Market Factor (% supply/demand adj.)</FieldLabel>
            <Input type="number" step="1" className="h-7 text-xs" value={((form.marketFactor ?? 0) * 100).toFixed(0)}
              onChange={(e: any) => setF("marketFactor", (parseFloat(e.target.value) || 0) / 100)}
              onBlur={() => settingsMutation.mutate(form)} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Job mix total indicator */}
        {(() => {
          const totalMix = jobTypesList.reduce((s: number, jt: any) => s + (jt.jobMixPct ?? 0), 0);
          const isBalanced = Math.abs(totalMix - 100) < 0.5;
          return (
            <div className={`p-2.5 rounded-lg flex items-center justify-between text-xs ${
              isBalanced ? "bg-chart-3/5 border border-chart-3/30" : "bg-amber-500/5 border border-amber-500/30"
            }`}>
              <span className="font-medium">
                Job Mix Total: <strong>{Math.round(totalMix)}%</strong>
                {!isBalanced && " — must equal 100%"}
              </span>
              <span className={`font-bold ${isBalanced ? "text-chart-3" : "text-amber-600"}`}>
                {isBalanced ? "✓ Balanced" : `${totalMix > 100 ? "+" : "-"}${Math.abs(totalMix - 100).toFixed(0)}% off`}
              </span>
            </div>
          );
        })()}

        {/* Job Type List */}
        {jobTypesList.map((jt: any) => {
          const bd = breakdown.find((b: any) => b.id === jt.id);
          const isEditing = editId === jt.id;

          if (isEditing) {
            return (
              <div key={jt.id} className="p-3 border border-primary/30 rounded-lg bg-muted/30 space-y-2" data-testid={`jt-edit-${jt.id}`}>
                <div className="flex items-center gap-2">
                  <Input className="h-7 text-xs flex-1 font-medium" placeholder="Job type name" value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })} />
                  <Button size="sm" className="h-7 px-2" onClick={saveEdit} disabled={updateMut.isPending}>
                    <Check className="w-3.5 h-3.5 mr-1" />Save
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditId(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Field label="Job Mix %" tip={TIPS.jtJobMixPct} value={editData.jobMixPct} onChange={(v: string) => setEditData({ ...editData, jobMixPct: v })} suffix="%" />
                  <Field label="Miles/Run" tip={TIPS.jtMilesPerRun} value={editData.avgMilesPerRun} onChange={(v: string) => setEditData({ ...editData, avgMilesPerRun: v })} step="10" />
                  <Field label="Complexity %" tip={TIPS.jtComplexity} value={editData.complexityFactor} onChange={(v: string) => setEditData({ ...editData, complexityFactor: v })} suffix="%" />
                  <Field label="Urgency %" tip={TIPS.jtUrgency} value={editData.urgencyFactor} onChange={(v: string) => setEditData({ ...editData, urgencyFactor: v })} suffix="%" />
                  <Field label="Deadhead %" tip={TIPS.jtDeadhead} value={editData.deadheadPct} onChange={(v: string) => setEditData({ ...editData, deadheadPct: v })} suffix="%" />
                  <Field label="Fuel Surch ($/mi)" tip={TIPS.jtFuelSurcharge} value={editData.fuelSurchargePerMile} onChange={(v: string) => setEditData({ ...editData, fuelSurchargePerMile: v })} suffix="$" />
                  <Field label="Accessorial/Run" tip={TIPS.jtAccessorial} value={editData.accessorialPerRun} onChange={(v: string) => setEditData({ ...editData, accessorialPerRun: v })} suffix="$" />
                </div>
              </div>
            );
          }

          return (
            <div key={jt.id} className="p-3 border border-border rounded-lg hover:border-primary/30 transition-colors group" data-testid={`jt-row-${jt.id}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{jt.name}</p>
                    <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                      {jt.jobMixPct ?? 0}% of miles
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">{jt.avgMilesPerRun} mi/run</span>
                    {bd && (() => {
                      const runsM1 = Math.round(bd.runsPerMonth);
                      const inc = form.monthlyMilesIncrement ?? 0;
                      const runsM12 = inc > 0
                        ? Math.round(((form.totalMilesPerMonth + 11 * inc) * ((jt.jobMixPct ?? 0) / 100)) / (jt.avgMilesPerRun || 1))
                        : null;
                      return (
                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded flex items-center gap-1">
                          ~{runsM1} runs/mo
                          {runsM12 !== null && runsM12 !== runsM1 && (
                            <span className="text-chart-3">→ ~{runsM12} by Mo.12</span>
                          )}
                        </span>
                      );
                    })()}
                    {jt.complexityFactor > 0 && <span className="text-[9px] text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded">+{(jt.complexityFactor * 100).toFixed(0)}% complexity</span>}
                    {jt.urgencyFactor > 0 && <span className="text-[9px] text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">+{(jt.urgencyFactor * 100).toFixed(0)}% urgency</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary" onClick={() => startEdit(jt)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => deleteMut.mutate(jt.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              {bd && (
                <div className="space-y-1.5">
                  {/* Hero: Surplus above BEP — this is what complexity/urgency actually drives */}
                  <div className={`p-2 rounded-lg border flex items-center justify-between ${
                    bd.isProfitable
                      ? "bg-chart-3/5 border-chart-3/30"
                      : "bg-destructive/5 border-destructive/30"
                  }`}>
                    <div>
                      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">
                        Profitability vs BEP
                      </p>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className={`text-sm font-bold tabular-nums ${
                          bd.isProfitable ? "text-chart-3" : "text-destructive"
                        }`}>
                          {bd.surplusPerMile >= 0 ? "+" : ""}{bd.surplusPerMile}/mi above BEP
                        </span>
                        {(bd.complexityFactor > 0 || bd.urgencyFactor > 0) && (
                          <span className="text-[9px] text-muted-foreground">
                            (includes
                            {bd.complexityFactor > 0 && ` +${(bd.complexityFactor * 100).toFixed(0)}% complexity`}
                            {bd.urgencyFactor > 0 && ` +${(bd.urgencyFactor * 100).toFixed(0)}% urgency`}
                            )
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      bd.isProfitable
                        ? "bg-chart-3/10 text-chart-3"
                        : "bg-destructive/10 text-destructive"
                    }`}>
                      {bd.isProfitable ? "PROFITABLE" : "BELOW BEP"}
                    </span>
                  </div>

                  {/* Supporting details */}
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="p-1.5 bg-muted/30 rounded text-center">
                      <p className="text-[9px] text-muted-foreground">Adjusted Rate/mi</p>
                      <p className="text-xs font-bold tabular-nums">${bd.totalRatePerMile}/mi</p>
                      <p className="text-[8px] text-muted-foreground">incl. all premiums</p>
                    </div>
                    <div className="p-1.5 bg-muted/30 rounded text-center">
                      <p className="text-[9px] text-muted-foreground">BEP Floor/mi</p>
                      <p className="text-xs font-bold tabular-nums text-muted-foreground">${bd.bepRatePerMile}/mi</p>
                      <p className="text-[8px] text-muted-foreground">min to cover costs</p>
                    </div>
                    <div className="p-1.5 bg-muted/30 rounded text-center">
                      <p className="text-[9px] text-muted-foreground">Runs/Month</p>
                      <p className="text-xs font-bold tabular-nums">{Math.round(bd.runsPerMonth)}</p>
                      {(() => {
                        const inc = form.monthlyMilesIncrement ?? 0;
                        if (inc <= 0) return <p className="text-[8px] text-muted-foreground">Mo.1 · flat</p>;
                        const runsM12 = Math.round(((form.totalMilesPerMonth + 11 * inc) * ((jt.jobMixPct ?? 0) / 100)) / (jt.avgMilesPerRun || 1));
                        return <p className="text-[8px] text-chart-3 font-medium">→ ~{runsM12} by Mo.12</p>;
                      })()}
                    </div>
                    <div className="p-1.5 bg-muted/30 rounded text-center">
                      <p className="text-[9px] text-muted-foreground">Allocated Cost</p>
                      <p className="text-xs font-bold tabular-nums">${bd.allocatedFixed !== undefined ? (bd.allocatedFixed + bd.ownVariableCosts).toLocaleString() : "—"}</p>
                      <p className="text-[8px] text-muted-foreground">this job's share</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add Job Type */}
        {showAdd ? (
          <div className="p-3 border border-dashed border-primary/40 rounded-lg bg-primary/5 space-y-2">
            <p className="text-xs font-semibold text-primary">New Job Type</p>
            <div className="flex items-center gap-2">
              <Input className="h-7 text-xs flex-1" placeholder="Job type name (e.g. Refrigerated LTL)" value={newJT.name}
                onChange={(e) => setNewJT({ ...newJT, name: e.target.value })} data-testid="input-new-jt-name" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Field label="Job Mix %" tip={TIPS.jtJobMixPct} value={newJT.jobMixPct} onChange={(v: string) => setNewJT({ ...newJT, jobMixPct: v })} suffix="%" />
              <Field label="Miles/Run" tip={TIPS.jtMilesPerRun} value={newJT.avgMilesPerRun} onChange={(v: string) => setNewJT({ ...newJT, avgMilesPerRun: v })} step="10" />
              <Field label="Complexity %" tip={TIPS.jtComplexity} value={newJT.complexityFactor} onChange={(v: string) => setNewJT({ ...newJT, complexityFactor: v })} suffix="%" />
              <Field label="Urgency %" tip={TIPS.jtUrgency} value={newJT.urgencyFactor} onChange={(v: string) => setNewJT({ ...newJT, urgencyFactor: v })} suffix="%" />
              <Field label="Deadhead %" tip={TIPS.jtDeadhead} value={newJT.deadheadPct} onChange={(v: string) => setNewJT({ ...newJT, deadheadPct: v })} suffix="%" />
              <Field label="Fuel Surch ($/mi)" tip={TIPS.jtFuelSurcharge} value={newJT.fuelSurchargePerMile} onChange={(v: string) => setNewJT({ ...newJT, fuelSurchargePerMile: v })} suffix="$" />
              <Field label="Accessorial/Run" tip={TIPS.jtAccessorial} value={newJT.accessorialPerRun} onChange={(v: string) => setNewJT({ ...newJT, accessorialPerRun: v })} suffix="$" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={submitNew} disabled={!newJT.name || addMut.isPending} data-testid="button-add-jt">
                <Plus className="w-3.5 h-3.5 mr-1" />Add Job Type
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowAdd(true)} data-testid="button-show-add-jt">
            <Plus className="w-3.5 h-3.5 mr-1" />Add Job Type
          </Button>
        )}

        {/* Totals Summary */}
        {rm && (
          <div className="p-3 bg-muted/20 border border-border rounded-lg" data-testid="jt-totals">
            <div className="flex items-center gap-1.5 mb-2">
              <Info className="w-3.5 h-3.5 text-primary" />
              <p className="text-xs font-semibold text-primary uppercase tracking-wide">Revenue Model Total</p>
              {rm.usingRateModel && <span className="ml-auto text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Active</span>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2 bg-background rounded border border-border text-center">
                <p className="text-[10px] text-muted-foreground">Active Job Types</p>
                <p className="text-sm font-bold">{rm.totalJobTypes}</p>
              </div>
              <div className="p-2 bg-background rounded border border-border text-center">
                <p className="text-[10px] text-muted-foreground">Total Runs/Mo</p>
                <p className="text-sm font-bold">{rm.totalRuns}</p>
              </div>
              <div className="p-2 bg-background rounded border border-border text-center">
                <p className="text-[10px] text-muted-foreground">Total Miles/Mo</p>
                <p className="text-sm font-bold">{rm.jobTypeTotalMiles?.toLocaleString()}</p>
              </div>
              <div className={`p-2 rounded border text-center ${rm.usingRateModel ? "bg-primary/5 border-primary/20" : "bg-background border-border"}`}>
                <p className="text-[10px] text-muted-foreground">Computed Revenue</p>
                <p className={`text-sm font-bold ${rm.usingRateModel ? "text-primary" : ""}`}>
                  ${rm.computedMonthlyRevenue?.toLocaleString()}/mo
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Driver Growth Timeline Section ────────────────────────────────────────────────────────
function DriverTimelineSection({ baseFleetSize }: { baseFleetSize: number }) {
  const { toast } = useToast();
  const { data: milestones = [], isLoading } = useQuery({
    queryKey: ["/api/driver-milestones"],
    queryFn: () => apiRequest("GET", "/api/driver-milestones").then((r) => r.json()),
  });

  const [editId, setEditId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ startMonth: "", fleetSize: "", note: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [newM, setNewM] = useState({ startMonth: "", fleetSize: "", note: "" });

  const addMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/driver-milestones", d).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver-milestones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      setShowAdd(false);
      setNewM({ startMonth: "", fleetSize: "", note: "" });
      toast({ title: "Milestone added" });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/driver-milestones/${id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver-milestones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      setEditId(null);
      toast({ title: "Milestone updated" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/driver-milestones/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/driver-milestones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      toast({ title: "Milestone removed" });
    },
  });

  // Build the 12-month fleet size array for the visual timeline
  const fleetByMonth = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    let fleet = baseFleetSize;
    const sorted = [...milestones].sort((a: any, b: any) => a.startMonth - b.startMonth);
    for (const m of sorted) {
      if (m.startMonth <= month) fleet = m.fleetSize;
      else break;
    }
    return fleet;
  });

  const maxFleet = Math.max(...fleetByMonth, baseFleetSize);

  return (
    <Card data-testid="card-driver-timeline">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
          <Truck className="w-4 h-4 text-primary" />
          Fleet Growth Timeline
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Define when you add drivers. Each driver brings their own vehicle — revenue, fuel, maintenance, and insurance all scale automatically at that month.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Visual 12-month fleet bar */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Fleet size by month</p>
          <div className="flex gap-1 items-end h-14">
            {fleetByMonth.map((fleet, i) => {
              const isMilestone = milestones.some((m: any) => m.startMonth === i + 1);
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-bold tabular-nums text-muted-foreground">{fleet}</span>
                  <div
                    className={`w-full rounded-t transition-all ${
                      isMilestone ? "bg-primary" : "bg-primary/40"
                    }`}
                    style={{ height: `${(fleet / maxFleet) * 40 + 8}px` }}
                  />
                  <span className={`text-[8px] ${
                    isMilestone ? "text-primary font-bold" : "text-muted-foreground"
                  }`}>M{i + 1}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Darker bars = milestone months. Month 1 = base fleet size ({baseFleetSize}) from Settings.
          </p>
        </div>

        {/* Milestone list */}
        <div className="space-y-1">
          {milestones.length === 0 && (
            <p className="text-xs text-muted-foreground py-2 px-3">No milestones set — fleet stays at {baseFleetSize} driver{baseFleetSize !== 1 ? "s" : ""} all year.</p>
          )}
          {[...milestones].sort((a: any, b: any) => a.startMonth - b.startMonth).map((m: any) => (
            editId === m.id ? (
              <div key={m.id} className="flex flex-wrap gap-2 p-2.5 rounded-lg bg-muted/40 border border-primary/30">
                <div className="space-y-0.5 w-20">
                  <Label className="text-[10px]">Month</Label>
                  <Input type="number" min="1" max="12" className="h-7 text-xs"
                    value={editData.startMonth}
                    onChange={(e) => setEditData({ ...editData, startMonth: e.target.value })} />
                </div>
                <div className="space-y-0.5 w-24">
                  <Label className="text-[10px]">Fleet size</Label>
                  <Input type="number" min="1" className="h-7 text-xs"
                    value={editData.fleetSize}
                    onChange={(e) => setEditData({ ...editData, fleetSize: e.target.value })} />
                </div>
                <div className="space-y-0.5 flex-1 min-w-[120px]">
                  <Label className="text-[10px]">Note (optional)</Label>
                  <Input className="h-7 text-xs" placeholder="e.g. Hire Driver 2"
                    value={editData.note}
                    onChange={(e) => setEditData({ ...editData, note: e.target.value })} />
                </div>
                <div className="flex items-end gap-1">
                  <Button size="sm" className="h-7 px-2" onClick={() => updateMut.mutate({
                    id: m.id,
                    data: { startMonth: parseInt(editData.startMonth), fleetSize: parseInt(editData.fleetSize), note: editData.note },
                  })} disabled={updateMut.isPending}>
                    <Check className="w-3.5 h-3.5 mr-1" />Save
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setEditId(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 group">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">M{m.startMonth}</span>
                  <span className="text-sm font-medium">Fleet becomes <strong>{m.fleetSize}</strong> driver{m.fleetSize !== 1 ? "s" : ""}</span>
                  {m.note && <span className="text-xs text-muted-foreground">— {m.note}</span>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                    onClick={() => { setEditId(m.id); setEditData({ startMonth: String(m.startMonth), fleetSize: String(m.fleetSize), note: m.note ?? "" }); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMut.mutate(m.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )
          ))}
        </div>

        {/* Add milestone */}
        {showAdd ? (
          <div className="p-4 rounded-lg border border-primary/40 bg-primary/5 space-y-3">
            <p className="text-sm font-semibold text-primary">Add Growth Milestone</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <FieldLabel tip={TIPS.milestoneMonth}>Starting Month (1–12)</FieldLabel>
                <Input type="number" min="1" max="12" className="h-9"
                  placeholder="e.g. 3"
                  value={newM.startMonth}
                  onChange={(e) => setNewM({ ...newM, startMonth: e.target.value })} />
              </div>
              <div className="space-y-1">
                <FieldLabel tip={TIPS.milestoneFleet}>Total Drivers from this Month</FieldLabel>
                <Input type="number" min="1" className="h-9"
                  placeholder="e.g. 2"
                  value={newM.fleetSize}
                  onChange={(e) => setNewM({ ...newM, fleetSize: e.target.value })} />
              </div>
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <FieldLabel tip={TIPS.milestoneNote}>Label / Note (optional)</FieldLabel>
                <Input className="h-9" placeholder="e.g. Hire Driver 2"
                  value={newM.note}
                  onChange={(e) => setNewM({ ...newM, note: e.target.value })} />
              </div>
            </div>
            {newM.startMonth && newM.fleetSize && (
              <p className="text-xs text-primary/80">
                From Month {newM.startMonth} onward — fleet becomes <strong>{newM.fleetSize}</strong> driver{parseInt(newM.fleetSize) !== 1 ? "s" : ""}. Revenue, fuel, insurance, and all per-mile costs will scale accordingly.
              </p>
            )}
            <div className="flex gap-2">
              <Button className="flex-1 h-9" onClick={() => {
                if (!newM.startMonth || !newM.fleetSize) return;
                addMut.mutate({ startMonth: parseInt(newM.startMonth), fleetSize: parseInt(newM.fleetSize), note: newM.note });
              }} disabled={!newM.startMonth || !newM.fleetSize || addMut.isPending}>
                <Plus className="w-4 h-4 mr-1.5" />
                {addMut.isPending ? "Saving…" : "Save Milestone"}
              </Button>
              <Button variant="outline" className="h-9 px-4" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        ) : (
          <Button className="w-full h-9" variant="outline" onClick={() => setShowAdd(true)}>
            <Plus className="w-4 h-4 mr-1.5" />Add Growth Milestone
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function JobTypesSectionWithMilestoneCheck(props: { form: any; setF: any; settingsMutation: any }) {
  const { data: milestones = [] } = useQuery({
    queryKey: ["/api/driver-milestones"],
    queryFn: () => apiRequest("GET", "/api/driver-milestones").then((r) => r.json()),
  });
  return <JobTypesSection {...props} hasMilestones={(milestones as any[]).length > 0} />;
}

export default function Settings() {
  const { toast } = useToast();

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ["/api/settings"],
    queryFn: () => apiRequest("GET", "/api/settings").then((r) => r.json()),
  });

  const { data: expensesList = [], isLoading: expensesLoading } = useQuery({
    queryKey: ["/api/expenses"],
    queryFn: () => apiRequest("GET", "/api/expenses").then((r) => r.json()),
  });

  const [form, setForm] = useState<any>({
    businessName: "", state: "FL", fleetSize: 1,
    totalMilesPerMonth: 5000,
    monthlyMilesIncrement: 0,
    avgMpg: 20, monthlyRevenue: 15000, revenueGrowthRate: 0.024,
    useOfProceeds: "",
    // Revenue model defaults
    useRateModel: false,
    baseRatePerMile: 2.40,
    marginTarget: 0.20,
    marketFactor: 0.05,
    loadComplexityFactor: 0.0,
    urgencyFactor: 0.0,
    deadheadPct: 0.15,
    fuelSurchargePerMile: 0.45,
    accessorialPerMonth: 0,
  });
  const [newExpense, setNewExpense] = useState({ name: "", category: "fixed", amount: "", ratePerMile: "", description: "" });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", category: "fixed", amount: "", ratePerMile: "", description: "" });
  const [growthInput, setGrowthInput] = useState("");

  useEffect(() => {
    if (settings) {
      setForm((prev: any) => ({ ...prev, ...settings }));
      setGrowthInput((settings.revenueGrowthRate * 100).toFixed(1));
    }
  }, [settings]);

  // Live preview is vestigial now (job types drive revenue); keep for margin/market sliders
  const preview = useMemo(() => {
    const totalMiles = 500; // placeholder — real miles come from job types
    const billable = totalMiles * (1 - (form.deadheadPct ?? 0.15));
    const rateMultiplier =
      (1 + form.marginTarget) *
      (1 + form.marketFactor) *
      (1 + form.loadComplexityFactor) *
      (1 + form.urgencyFactor);
    const computedRate = form.baseRatePerMile * rateMultiplier;
    const totalRate = computedRate + form.fuelSurchargePerMile;
    const revenue = totalRate * billable + form.accessorialPerMonth;
    return {
      computedRate: Math.round(computedRate * 100) / 100,
      totalRate: Math.round(totalRate * 100) / 100,
      billableMiles: Math.round(billable),
      deadheadMiles: Math.round(totalMiles * form.deadheadPct),
      revenue: Math.round(revenue),
    };
  }, [form]);

  const settingsMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/settings", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      toast({ title: "Settings saved" });
    },
  });

  const addExpenseMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/expenses", data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      setNewExpense({ name: "", category: "fixed", amount: "" });
      toast({ title: "Expense added" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      toast({ title: "Expense removed" });
    },
  });

  const updateExpenseMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/expenses/${id}`, data).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/financial-summary"] });
      setEditingId(null);
      toast({ title: "Expense updated" });
    },
  });

  const startEdit = (exp: any) => {
    setEditingId(exp.id);
    setEditForm({
      name: exp.name,
      category: exp.category,
      amount: String(exp.amount),
      ratePerMile: exp.ratePerMile != null ? String(exp.ratePerMile) : "",
      description: exp.description ?? "",
    });
  };

  const saveEdit = (id: number) => {
    if (!editForm.name) return;
    const rpm = parseFloat(editForm.ratePerMile);
    updateExpenseMutation.mutate({
      id,
      data: {
        name: editForm.name,
        category: editForm.category,
        amount: parseFloat(editForm.amount) || 0,
        ratePerMile: editForm.category === "variable" && !isNaN(rpm) && rpm > 0 ? rpm : null,
        description: editForm.description,
      },
    });
  };

  const setF = (key: string, val: any) => setForm((f: any) => ({ ...f, [key]: val }));

  if (settingsLoading || expensesLoading) {
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your business, fleet, and revenue model</p>
      </div>

      {/* ── Business & Fleet ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Business &amp; Fleet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <FieldLabel tip={TIPS.businessName}>Business Name</FieldLabel>
              <Input
                value={form.businessName}
                onChange={(e) => setF("businessName", e.target.value)}
                data-testid="input-business-name"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel tip={TIPS.state}>State (for gas prices)</FieldLabel>
              <Select value={form.state} onValueChange={(v) => setF("state", v)}>
                <SelectTrigger data-testid="select-state"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <FieldLabel tip={TIPS.fleetSize}>Fleet Size (trucks)</FieldLabel>
              <Input type="number" value={form.fleetSize}
                onChange={(e) => setF("fleetSize", parseInt(e.target.value) || 0)}
                data-testid="input-fleet-size" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <FieldLabel tip="Month 1 starting miles. The model adds your monthly increment each month. Driver count auto-assigns: 1–10k=1 driver, 10k–20k=2 drivers, 20k–30k=3 drivers. etc.">
                    Starting Miles / Month (M1)
                  </FieldLabel>
                  <SpinInput
                    value={form.totalMilesPerMonth ?? 5000}
                    onChange={(v) => setF("totalMilesPerMonth", v)}
                    step={500} min={0} suffix="mi"
                    testId="input-total-miles"
                  />
                </div>
                <div className="space-y-1">
                  <FieldLabel tip="Miles added each month on top of the starting miles. Set to 0 for a flat model. Example: start 6,000 + 1,000/mo = 6k, 7k, 8k … When miles cross 10k, 20k, 30k etc. a new driver is auto-assigned that month with ramp-up.">
                    Monthly Miles Increase (+/mo)
                  </FieldLabel>
                  <SpinInput
                    value={form.monthlyMilesIncrement ?? 0}
                    onChange={(v) => setF("monthlyMilesIncrement", v)}
                    step={100} min={0} suffix="mi/mo"
                    testId="input-miles-increment"
                  />
                </div>
              </div>

              {/* 12-month miles + driver preview */}
              {(() => {
                const start = form.totalMilesPerMonth ?? 5000;
                const inc = form.monthlyMilesIncrement ?? 0;
                const months = Array.from({ length: 12 }, (_, i) => ({
                  m: i + 1,
                  miles: Math.max(0, start + inc * i),
                  drivers: Math.max(1, Math.ceil(Math.max(0, start + inc * i) / 10000)),
                }));
                const maxMiles = Math.max(...months.map(m => m.miles), 1);
                const driverChanges = months.filter((m, i) =>
                  i === 0 ? m.drivers > 1 : m.drivers > months[i-1].drivers
                );
                return (
                  <div className="mt-2 p-3 bg-muted/20 rounded-lg border border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">12-Month Miles &amp; Driver Projection</p>
                    <div className="flex gap-1 items-end h-16 mb-1">
                      {months.map((m, i) => {
                        const isDriverChange = i === 0 ? m.drivers > 1 : m.drivers > months[i-1].drivers;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                            <span className="text-[8px] font-bold text-muted-foreground">
                              {m.drivers > 1 ? m.drivers + 'd' : ''}
                            </span>
                            <div
                              title={`M${m.m}: ${m.miles.toLocaleString()} mi, ${m.drivers} driver${m.drivers !== 1 ? 's' : ''}`}
                              className={`w-full rounded-t transition-all ${
                                isDriverChange ? 'bg-primary' :
                                m.drivers > 1 ? 'bg-primary/60' : 'bg-primary/30'
                              }`}
                              style={{ height: `${(m.miles / maxMiles) * 48 + 4}px` }}
                            />
                            <span className="text-[8px] text-muted-foreground">M{m.m}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>M1: {start.toLocaleString()} mi</span>
                      {inc !== 0 && <span>+{inc.toLocaleString()}/mo</span>}
                      <span>M12: {months[11].miles.toLocaleString()} mi</span>
                    </div>
                    {driverChanges.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {driverChanges.map((m, i) => (
                          <span key={i} className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">
                            M{m.m}: → {m.drivers} drivers (⇑ RAMP)
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="space-y-1.5">
              <FieldLabel tip="Global base rate per mile applied to ALL job types. Job type adjustments (complexity %, urgency %, fuel surcharge) are added on top of this rate. Industry benchmarks: dry van $1.80–2.50/mi, contract $2.20–3.00/mi.">
                Base Rate / Mile ($)
              </FieldLabel>
              <SpinInput
                value={form.baseRatePerMile ?? 2.40}
                onChange={(v) => setF("baseRatePerMile", v)}
                step={0.05}
                min={0.01}
                prefix="$"
                suffix="/mi"
                testId="input-base-rate"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel tip={TIPS.avgMpg}>Avg MPG</FieldLabel>
              <SpinInput
                value={form.avgMpg ?? 20}
                onChange={(v) => setF("avgMpg", v)}
                step={0.5}
                min={1}
                suffix="mpg"
                testId="input-mpg"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel tip={TIPS.truckDownPayment}>Avg Truck Down Payment ($)</FieldLabel>
              <SpinInput
                value={form.truckDownPayment ?? 5000}
                onChange={(v) => setF("truckDownPayment", v)}
                step={500}
                min={0}
                prefix="$"
                testId="input-truck-down-payment"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel tip={TIPS.monthlyLeasePayment}>Monthly Lease / Payment ($)</FieldLabel>
              <SpinInput
                value={form.monthlyLeasePayment ?? 800}
                onChange={(v) => setF("monthlyLeasePayment", v)}
                step={50}
                min={0}
                prefix="$"
                suffix="/mo per truck"
                testId="input-monthly-lease"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel tip={TIPS.revenueGrowthRate}>Revenue Growth Rate (%/year)</FieldLabel>
              <Input type="number" step="0.1" placeholder="5.0" value={growthInput}
                onChange={(e) => {
                  setGrowthInput(e.target.value);
                  const p = parseFloat(e.target.value);
                  if (!isNaN(p)) setF("revenueGrowthRate", p / 100);
                }}
                onBlur={() => {
                  const p = parseFloat(growthInput);
                  const v = isNaN(p) ? 0 : p;
                  setGrowthInput(v.toFixed(1));
                  setF("revenueGrowthRate", v / 100);
                }}
                data-testid="input-growth" />
            </div>
          </div>
          <Button onClick={() => settingsMutation.mutate(form)} disabled={settingsMutation.isPending}
            size="sm" data-testid="button-save-settings">
            <Save className="w-3.5 h-3.5 mr-1.5" />Save Settings
          </Button>
        </CardContent>
      </Card>

      {/* Fleet Growth Timeline removed — drivers now auto-assigned from Total Miles */}

      {/* ── Job Types & Revenue Model ── */}
      <JobTypesSectionWithMilestoneCheck
        form={form}
        setF={setF}
        settingsMutation={settingsMutation}
      />

      {/* ── OLD Revenue Model (hidden) ── */}

      {/* ── Expenses ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Expenses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Column headers */}
          <div className="flex items-center gap-2 px-3 pb-1 border-b border-border">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide w-20">Type</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex-1">Name</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide w-28 text-right">Rate</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide w-24 text-right">Monthly Cost</span>
            <span className="w-16" />
          </div>
          <div className="space-y-0.5">
            {expensesList.map((exp: any) => {
              const isEditing = editingId === exp.id;
              const isPerMile = exp.category === "variable" && exp.ratePerMile != null && exp.ratePerMile > 0;
              // Estimated monthly cost shown in list view (actual computed value comes from API)
              const displayAmount = isPerMile
                ? `$${exp.ratePerMile}/mi`
                : `$${exp.amount.toLocaleString()}/mo`;

              return isEditing ? (
                /* ── Edit mode ── */
                <div key={exp.id} className="space-y-1">
                <div
                  className="flex flex-wrap items-center gap-2 py-2 px-3 rounded-md bg-muted/40 border border-primary/30"
                  data-testid={`expense-edit-${exp.id}`}>
                  <Input className="h-7 text-xs flex-1 min-w-[120px]" value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Expense name"
                    data-testid={`input-edit-name-${exp.id}`} />
                  <Select value={editForm.category} onValueChange={(v) => setEditForm({ ...editForm, category: v, ratePerMile: v === "fixed" ? "" : editForm.ratePerMile })}>
                    <SelectTrigger className="h-7 text-xs w-28" data-testid={`select-edit-category-${exp.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fixed">Fixed</SelectItem>
                      <SelectItem value="variable">Variable</SelectItem>
                    </SelectContent>
                  </Select>
                  {editForm.category === "variable" ? (
                    /* Variable: $/mile input */
                    <div className="relative w-32">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$/mi</span>
                      <Input type="number" step="0.01" className="h-7 text-xs pl-8"
                        placeholder="0.15"
                        value={editForm.ratePerMile}
                        onChange={(e) => setEditForm({ ...editForm, ratePerMile: e.target.value, amount: "0" })}
                        data-testid={`input-edit-ratepermi-${exp.id}`} />
                    </div>
                  ) : (
                    /* Fixed: flat $/mo input */
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input type="number" className="h-7 text-xs pl-5" value={editForm.amount}
                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                        data-testid={`input-edit-amount-${exp.id}`} />
                    </div>
                  )}
                  <Button size="sm" className="h-7 w-7 p-0" onClick={() => saveEdit(exp.id)}
                    disabled={updateExpenseMutation.isPending} data-testid={`button-save-edit-${exp.id}`}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground"
                    onClick={() => setEditingId(null)} data-testid={`button-cancel-edit-${exp.id}`}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {/* Source / description field */}
                <Input
                  className="h-7 text-xs text-muted-foreground"
                  placeholder="Data source or note — e.g. IRS Pub. 463 (§80/day per diem), 2025"
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  data-testid={`input-edit-desc-${exp.id}`}
                />
                </div>
              ) : (
                /* ── View mode ── */
                <div key={exp.id}
                  className="py-2 px-3 rounded-md hover:bg-muted/50 group"
                  data-testid={`expense-row-${exp.id}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                        exp.category === "fixed" ? "bg-primary/10 text-primary" : "bg-orange-500/10 text-orange-600"
                      }`}>{exp.category}</span>
                      <span className="text-sm font-medium truncate">{exp.name}</span>
                      {isPerMile && (
                        <span className="text-[10px] text-orange-600 bg-orange-500/10 px-1.5 py-0.5 rounded font-medium flex-shrink-0">
                          scales with miles
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-sm font-medium tabular-nums">
                        {isPerMile
                          ? <><span className="font-bold">${exp.ratePerMile}/mi</span><span className="text-xs text-muted-foreground ml-1">× miles</span></>
                          : `$${exp.amount.toLocaleString()}/mo`}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(exp)}
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary"
                        data-testid={`button-edit-${exp.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteExpenseMutation.mutate(exp.id)}
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                        data-testid={`button-delete-${exp.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  {/* Data source citation */}
                  {exp.description ? (
                    <p className="text-[10px] text-muted-foreground mt-0.5 ml-1 leading-relaxed">
                      <span className="font-medium text-muted-foreground/70">Source: </span>{exp.description}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Add New Expense</p>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2 items-end">
              <div className="space-y-1">
                <FieldLabel tip={TIPS.expenseName}>Name</FieldLabel>
                <Input placeholder="e.g. Truck Wash" value={newExpense.name}
                  onChange={(e) => setNewExpense({ ...newExpense, name: e.target.value })}
                  data-testid="input-new-expense-name" />
              </div>
              <div className="w-28 space-y-1">
                <FieldLabel tip={TIPS.expenseCategory}>Type</FieldLabel>
                <Select value={newExpense.category} onValueChange={(v) =>
                  setNewExpense({ ...newExpense, category: v, ratePerMile: v === "fixed" ? "" : newExpense.ratePerMile })
                }>
                  <SelectTrigger data-testid="select-expense-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Fixed</SelectItem>
                    <SelectItem value="variable">Variable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newExpense.category === "variable" ? (
                <div className="w-32 space-y-1">
                  <FieldLabel tip={TIPS.expenseRatePerMile}>Rate ($/mile)</FieldLabel>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">$/mi</span>
                    <Input type="number" step="0.01" placeholder="0.15" value={newExpense.ratePerMile}
                      onChange={(e) => setNewExpense({ ...newExpense, ratePerMile: e.target.value, amount: "0" })}
                      className="pl-8"
                      data-testid="input-new-expense-rate" />
                  </div>
                  <p className="text-[9px] text-muted-foreground">Scales with miles driven</p>
                </div>
              ) : (
                <div className="w-28 space-y-1">
                  <FieldLabel tip={TIPS.expenseAmount}>Amount ($)</FieldLabel>
                  <Input type="number" placeholder="200" value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                    data-testid="input-new-expense-amount" />
                </div>
              )}
              {/* Source / citation field — spans full width below other fields */}
            </div>
            <div className="mt-2">
              <Input
                className="h-7 text-xs"
                placeholder="Data source or note — e.g. IRS Pub. 463 (§80/day), industry benchmark"
                value={newExpense.description}
                onChange={(e) => setNewExpense({ ...newExpense, description: e.target.value })}
                data-testid="input-new-expense-source"
              />
            </div>
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => {
                if (!newExpense.name) return;
                const rpm = parseFloat(newExpense.ratePerMile);
                const isRpm = newExpense.category === "variable" && !isNaN(rpm) && rpm > 0;
                if (!isRpm && !newExpense.amount) return;
                addExpenseMutation.mutate({
                  name: newExpense.name,
                  category: newExpense.category,
                  amount: parseFloat(newExpense.amount) || 0,
                  ratePerMile: isRpm ? rpm : null,
                  description: newExpense.description || "",
                  isActive: true,
                });
              }} disabled={!newExpense.name || (newExpense.category === "fixed" && !newExpense.amount)}
              data-testid="button-add-expense">
                <Plus className="w-3.5 h-3.5 mr-1" />Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
