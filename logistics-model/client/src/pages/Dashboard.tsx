import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, TrendingDown, Fuel, Truck, Target, Activity } from "lucide-react"; // TrendingUp already used for rate model card
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const CHART_COLORS = [
  "hsl(215, 60%, 40%)",
  "hsl(34, 80%, 50%)",
  "hsl(160, 50%, 42%)",
  "hsl(350, 55%, 48%)",
  "hsl(262, 45%, 52%)",
];

function KPICard({ title, value, subtitle, icon: Icon, trend }: {
  title: string; value: string; subtitle: string; icon: any; trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card data-testid={`kpi-${title.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">{title}</p>
            <p className="text-xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              {trend === "up" && <TrendingUp className="w-3 h-3 text-chart-3" />}
              {trend === "down" && <TrendingDown className="w-3 h-3 text-destructive" />}
              {subtitle}
            </p>
          </div>
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/financial-summary"],
    queryFn: () => apiRequest("GET", "/api/financial-summary").then((r) => r.json()),
    refetchInterval: 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-72 rounded-lg" />
          <Skeleton className="h-72 rounded-lg" />
        </div>
      </div>
    );
  }

  const { profitability, expenses, fuelCost, scenarioProjections, annualProjection, settings, driverTimeline } = data;

  // Current month fleet size (Month 1 = settings.fleetSize; first milestone may apply)
  const fleetByMonth: number[] = driverTimeline?.fleetByMonth ?? Array(12).fill(settings?.fleetSize ?? 1);
  const currentFleet = fleetByMonth[0]; // Month 1 fleet for dashboard figures

  // Expense breakdown for pie chart — use computedAmount for variable expenses
  const pieData = [
    { name: "Fixed", value: expenses.totalFixed },
    { name: "Variable", value: expenses.totalVariable },
    { name: "Fuel (Live)", value: expenses.monthlyFuelCost },
  ];


  // Base scenario projection for line chart
  const baseScenario = scenarioProjections?.find((s: any) => s.name === "Base Case");

  // Shared dataset for 12-month scenario chart (one row per month, scenario names as keys)
  const scenarioChartData = Array.from({ length: 12 }, (_, i) => {
    const row: Record<string, any> = { month: i + 1 };
    scenarioProjections?.forEach((s: any) => { row[s.name] = s.months[i]?.profit ?? 0; });
    return row;
  });

  return (
    <div className="p-6 space-y-6" data-testid="dashboard-page">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">{settings.businessName}</h1>
        <p className="text-sm text-muted-foreground">
          Financial dashboard — {settings.fleetSize} trucks, {settings.state}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="kpi-grid">
        <KPICard
          title="Monthly Revenue"
          value={`$${profitability.monthlyRevenue.toLocaleString()}`}
          subtitle={`$${annualProjection.revenue.toLocaleString()}/yr`}
          icon={DollarSign}
          trend="up"
        />
        <KPICard
          title="Total Expenses"
          value={`$${profitability.totalExpenses.toLocaleString()}`}
          subtitle={`$${annualProjection.expenses.toLocaleString()}/yr`}
          icon={TrendingDown}
          trend="neutral"
        />
        <KPICard
          title="Net Profit"
          value={`$${profitability.monthlyProfit.toLocaleString()}`}
          subtitle={`${profitability.profitMargin}% margin`}
          icon={profitability.monthlyProfit >= 0 ? TrendingUp : TrendingDown}
          trend={profitability.monthlyProfit >= 0 ? "up" : "down"}
        />
        <KPICard
          title="Fuel Cost (Live)"
          value={`$${fuelCost.monthlyFuelCost.toLocaleString()}`}
          subtitle={`${fuelCost.gallonsPerMonth} gal @ $${fuelCost.costPerGallon.toFixed(2)} · ${data.gasPriceSource ?? "static"}`}
          icon={Fuel}
        />
        <KPICard
          title="Cost per Mile"
          value={`$${profitability.costPerMile.toFixed(2)}`}
          subtitle={`Rev/mile: $${profitability.revenuePerMile.toFixed(2)}`}
          icon={Truck}
        />
        {/* FCCR Card */}
        <Card data-testid="kpi-fccr">
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">FCCR</p>
                <p className={`text-xl font-bold tabular-nums ${
                  profitability.fccr >= 1.25 ? "text-chart-3" :
                  profitability.fccr >= 1.20 ? "text-amber-600" : "text-destructive"
                }`}>{profitability.fccr?.toFixed(2)}x</p>
                <p className="text-xs text-muted-foreground mt-1">Fixed Charge Coverage</p>
              </div>
              <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
                <Activity className="w-4 h-4 text-primary" />
              </div>
            </div>
            <div className="relative h-2 bg-muted rounded-full overflow-hidden mt-1">
              <div className="absolute top-0 h-full w-px bg-destructive/60" style={{ left: `${(1.0/3.0)*100}%` }} />
              <div className="absolute top-0 h-full w-px bg-amber-500/60" style={{ left: `${(1.20/3.0)*100}%` }} />
              <div className="absolute top-0 h-full w-px bg-chart-3/60" style={{ left: `${(1.25/3.0)*100}%` }} />
              <div
                className={`h-full rounded-full ${
                  profitability.fccr >= 1.25 ? "bg-chart-3" :
                  profitability.fccr >= 1.20 ? "bg-amber-500" : "bg-destructive"
                }`}
                style={{ width: `${Math.min(((profitability.fccr ?? 0)/3.0)*100, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1.0x</span><span className="text-[10px]">1.20x</span><span>1.25x+</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Break-Even Point — full-width card */}
      <Card data-testid="kpi-break-even">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Target className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Break-Even Point (BEP)</p>
              <p className="text-[11px] text-muted-foreground">
                Formula: (Fixed + Variable) ÷ Total Miles — minimum rate/mile to cover ALL costs
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Primary: BEP rate/mile */}
            <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
              <p className="text-xs text-muted-foreground">BEP Rate / Mile</p>
              <p className="text-xl font-bold tabular-nums mt-0.5 text-primary">
                ${(profitability.breakEvenRatePerMile ?? 0).toFixed(2)}/mi
              </p>
              <p className={`text-xs font-semibold mt-1 ${
                profitability.revenuePerMile >= (profitability.breakEvenRatePerMile ?? 0) ? "text-chart-3" : "text-destructive"
              }`}>
                {profitability.revenuePerMile >= (profitability.breakEvenRatePerMile ?? 0)
                  ? `✓ +$${(profitability.surplusRatePerMile ?? 0).toFixed(2)}/mi above BEP`
                  : `✗ $${Math.abs(profitability.surplusRatePerMile ?? 0).toFixed(2)}/mi below BEP`}
              </p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">Actual Rate / Mile</p>
              <p className="text-base font-bold tabular-nums mt-0.5">${(profitability.revenuePerMile ?? 0).toFixed(2)}/mi</p>
              <p className="text-xs text-muted-foreground mt-1">Current revenue per mile</p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">BEP Revenue / Month</p>
              <p className="text-base font-bold tabular-nums mt-0.5">${profitability.breakEvenRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">(Fixed + Variable) total</p>
            </div>
            <div className="p-3 bg-muted/40 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground">Fixed / Variable Split</p>
              <p className="text-base font-bold tabular-nums mt-0.5">${(profitability.totalFixed ?? 0).toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Variable: ${(profitability.totalVariableCosts ?? 0).toLocaleString()}/mo</p>
            </div>
          </div>
          {/* Rate/mile progress bar */}
          <div className="mt-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span>$0/mi</span>
              <span>BEP: ${(profitability.breakEvenRatePerMile ?? 0).toFixed(2)}/mi</span>
              <span>Actual: ${(profitability.revenuePerMile ?? 0).toFixed(2)}/mi</span>
            </div>
            <div className="relative h-3 bg-muted rounded-full overflow-hidden">
              {/* BEP marker */}
              <div
                className="absolute top-0 h-full w-0.5 bg-foreground/50 z-10"
                style={{ left: `${Math.min(((profitability.breakEvenRatePerMile ?? 0) / (Math.max(profitability.revenuePerMile ?? 0, profitability.breakEvenRatePerMile ?? 0) * 1.25)) * 100, 100)}%` }}
              />
              <div
                className={`h-full rounded-full transition-all ${
                  profitability.revenuePerMile >= (profitability.breakEvenRatePerMile ?? 0) ? "bg-chart-3" : "bg-destructive"
                }`}
                style={{ width: `${Math.min(((profitability.revenuePerMile ?? 0) / (Math.max(profitability.revenuePerMile ?? 0, profitability.breakEvenRatePerMile ?? 0) * 1.25)) * 100, 100)}%` }}
              />
            </div>
            {/* BEP formula reminder */}
            <p className="text-[10px] text-muted-foreground font-mono mt-1.5">
              BEP = (${(profitability.totalFixed ?? 0).toLocaleString()} fixed + ${(profitability.totalVariableCosts ?? 0).toLocaleString()} variable) ÷ {(data?.expenses?.totalMilesPerMonth ?? 0).toLocaleString()} miles = <strong>${(profitability.breakEvenRatePerMile ?? 0).toFixed(2)}/mile</strong>
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Model Breakdown (shown when rate model is active, or always as info) */}
      {data?.revenueModel && (
        <Card data-testid="card-rate-model-summary">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Revenue Model</p>
                <p className="text-[11px] text-muted-foreground">
                  {data.revenueModel.usingRateModel
                    ? "Rate-per-mile engine active — revenue computed from pricing inputs"
                    : "Rate model preview — toggle ON in Settings to use these figures"}
                </p>
              </div>
              {data.revenueModel.usingRateModel && (
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-semibold">Active</span>
              )}
            </div>
            {/* Per-job-type profitability ranking — surplus/mile is the headline */}
            <div className="overflow-x-auto -mx-1">
            <table className="w-full text-xs min-w-[420px]">
              <thead>
                <tr className="border-b border-border/50 text-muted-foreground">
                  <th className="text-left py-1.5 font-medium">Job Type</th>
                  <th className="text-right py-1.5 font-medium">Adj. Rate/mi</th>
                  <th className="text-right py-1.5 font-medium">BEP Floor/mi</th>
                  <th className="text-right py-1.5 font-medium font-bold text-foreground">Surplus/mi ↑</th>
                  <th className="text-right py-1.5 font-medium">Revenue/mo</th>
                </tr>
              </thead>
              <tbody>
                {[...(data.revenueModel.jobTypeBreakdown ?? [])]
                  .sort((a: any, b: any) => b.surplusPerMile - a.surplusPerMile)
                  .map((jt: any) => (
                    <tr key={jt.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="py-1.5 pr-2">
                        <span className="font-medium">{jt.name}</span>
                        {(jt.complexityFactor > 0 || jt.urgencyFactor > 0) && (
                          <span className="ml-1.5 text-[9px] text-primary bg-primary/10 px-1 py-0.5 rounded">
                            {jt.complexityFactor > 0 && `+${(jt.complexityFactor * 100).toFixed(0)}% cmplx`}
                            {jt.complexityFactor > 0 && jt.urgencyFactor > 0 && " "}
                            {jt.urgencyFactor > 0 && `+${(jt.urgencyFactor * 100).toFixed(0)}% urgnt`}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">${jt.totalRatePerMile}/mi</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">${jt.bepRatePerMile}/mi</td>
                      <td className={`py-1.5 text-right tabular-nums font-bold ${
                        jt.isProfitable ? "text-chart-3" : "text-destructive"
                      }`}>
                        {jt.surplusPerMile >= 0 ? "+" : ""}{jt.surplusPerMile}/mi
                      </td>
                      <td className="py-1.5 text-right tabular-nums">${jt.monthlyRevenue?.toLocaleString()}</td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Expense Breakdown Pie */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Expense Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {pieData.map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Monthly P&L Bar */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">
              Revenue vs Expenses
              {currentFleet > 1 && <span className="ml-2 text-xs font-normal text-muted-foreground">({currentFleet} vehicles — Month 1)</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={[
                  { name: "Revenue", amount: profitability.monthlyRevenue },
                  { name: "Fixed", amount: expenses.totalFixed },
                  { name: "Variable", amount: expenses.totalVariable },
                  { name: "Fuel", amount: expenses.monthlyFuelCost },
                  { name: "Net Profit", amount: profitability.monthlyProfit },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,85%)" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                  {[CHART_COLORS[2], CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[3],
                    profitability.monthlyProfit >= 0 ? CHART_COLORS[2] : CHART_COLORS[3]
                  ].map((color, i) => (
                    <Cell key={i} fill={color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Scenario Projections */}
      <div>
        {/* 12-Month Scenario Projections */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">12-Month Profit Projection (by Scenario)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={scenarioChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0,0%,85%)" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(m) => `M${m}`}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value: number) => `$${value.toLocaleString()}`} />
                <Legend
                  verticalAlign="top"
                  wrapperStyle={{ paddingBottom: 8, fontSize: 11 }}
                />
                {scenarioProjections?.map((scenario: any, i: number) => (
                  <Line
                    key={scenario.name}
                    dataKey={scenario.name}
                    stroke={CHART_COLORS[i]}
                    strokeWidth={2}
                    dot={false}
                    legendType="line"
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
