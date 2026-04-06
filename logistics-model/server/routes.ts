import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { insertExpenseSchema, insertBusinessSettingsSchema, insertScenarioSchema, insertJobTypeSchema, insertDriverMilestoneSchema } from "@shared/schema";
import { z } from "zod";

// Cache for gas prices (refresh every 60 min)
let gasCache: { price: number; state: string; timestamp: number; source: string } | null = null;
const GAS_CACHE_TTL = 60 * 60 * 1000; // 60 minutes

// Current state-level regular gasoline averages sourced from AAA (April 3, 2026)
// Used as accurate fallback when live fetch is unavailable
const AAA_STATE_PRICES: Record<string, number> = {
  AK: 4.599, AL: 3.798, AR: 3.525, AZ: 4.688, CA: 5.891,
  CO: 3.830, CT: 4.024, DC: 4.200, DE: 3.884, FL: 4.232,
  GA: 3.701, HI: 5.503, IA: 3.480, ID: 4.268, IL: 4.266,
  IN: 3.949, KS: 3.334, KY: 3.904, LA: 3.749, MA: 3.861,
  MD: 4.063, ME: 3.911, MI: 3.886, MN: 3.546, MO: 3.486,
  MS: 3.711, MT: 3.753, NC: 3.912, ND: 3.430, NE: 3.426,
  NH: 3.869, NJ: 4.052, NM: 3.829, NV: 4.942, NY: 4.011,
  OH: 3.755, OK: 3.272, OR: 4.966, PA: 4.075, RI: 3.914,
  SC: 3.830, SD: 3.524, TN: 3.844, TX: 3.804, UT: 4.192,
  VA: 4.009, VT: 3.992, WA: 5.365, WI: 3.792, WV: 3.909,
  WY: 3.839,
};
const NATIONAL_AVERAGE = 4.091; // AAA national average, April 3 2026

async function fetchGasPrice(state: string): Promise<{ price: number; source: string }> {
  if (gasCache && gasCache.state === state && Date.now() - gasCache.timestamp < GAS_CACHE_TTL) {
    return { price: gasCache.price, source: gasCache.source };
  }

  // Try fetching live from AAA state page
  try {
    const stateSlug = state.toLowerCase();
    const url = `https://gasprices.aaa.com/?state=${stateSlug}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FleetFinance/1.0)" },
    });
    if (res.ok) {
      const html = await res.text();
      // AAA embeds price in a meta tag or visible span: e.g. "$4.232"
      const match = html.match(/Current Avg\.?[^$]*\$(\d+\.\d{3})/i)
        || html.match(/today[^$]*\$(\d+\.\d{3})/i)
        || html.match(/\$(\d+\.\d{3})/g)?.[0]?.match(/(\d+\.\d{3})/);
      if (match) {
        const price = parseFloat(match[1]);
        if (price > 1.5 && price < 10) {
          gasCache = { price, state, timestamp: Date.now(), source: "AAA (live)" };
          return { price, source: "AAA (live)" };
        }
      }
    }
  } catch (e) {
    // silent fallthrough to static table
  }

  // Use accurate AAA static table (updated April 3, 2026)
  const price = AAA_STATE_PRICES[state] ?? NATIONAL_AVERAGE;
  const source = AAA_STATE_PRICES[state] ? `AAA state avg — ${state}` : "AAA national avg";
  gasCache = { price, state, timestamp: Date.now(), source };
  return { price, source };
}

export async function registerRoutes(server: Server, app: Express) {
  // === Business Settings ===
  app.get("/api/settings", (_req, res) => {
    const settings = storage.getSettings();
    res.json(settings || {});
  });

  app.put("/api/settings", (req, res) => {
    try {
      const data = insertBusinessSettingsSchema.parse(req.body);
      const updated = storage.upsertSettings(data);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // PATCH just the use_of_proceeds field (called by Report page auto-save)
  app.patch("/api/settings/use-of-proceeds", (req, res) => {
    try {
      const { useOfProceeds } = z.object({ useOfProceeds: z.string() }).parse(req.body);
      const current = storage.getSettings();
      if (!current) return res.status(404).json({ error: "Settings not found" });
      const updated = storage.upsertSettings({ ...current, useOfProceeds });
      res.json({ useOfProceeds: updated.useOfProceeds });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // === Expenses ===
  app.get("/api/expenses", (_req, res) => {
    res.json(storage.getExpenses());
  });

  app.post("/api/expenses", (req, res) => {
    try {
      const data = insertExpenseSchema.parse(req.body);
      const created = storage.createExpense(data);
      res.json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/expenses/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateExpense(id, req.body);
    if (!updated) return res.status(404).json({ error: "Expense not found" });
    res.json(updated);
  });

  app.delete("/api/expenses/:id", (req, res) => {
    const id = parseInt(req.params.id);
    storage.deleteExpense(id);
    res.json({ success: true });
  });

  // === Driver Milestones ===
  app.get("/api/driver-milestones", (_req, res) => {
    res.json(storage.getDriverMilestones());
  });

  app.post("/api/driver-milestones", (req, res) => {
    try {
      const data = insertDriverMilestoneSchema.parse(req.body);
      res.json(storage.createDriverMilestone(data));
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.put("/api/driver-milestones/:id", (req, res) => {
    const updated = storage.updateDriverMilestone(parseInt(req.params.id), req.body);
    res.json(updated);
  });

  app.delete("/api/driver-milestones/:id", (req, res) => {
    storage.deleteDriverMilestone(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === Job Types ===
  app.get("/api/job-types", (_req, res) => {
    res.json(storage.getJobTypes());
  });

  app.post("/api/job-types", (req, res) => {
    try {
      const data = insertJobTypeSchema.parse(req.body);
      const created = storage.createJobType(data);
      res.json(created);
    } catch (e: any) { res.status(400).json({ error: e.message }); }
  });

  app.put("/api/job-types/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateJobType(id, req.body);
    res.json(updated);
  });

  app.delete("/api/job-types/:id", (req, res) => {
    storage.deleteJobType(parseInt(req.params.id));
    res.json({ success: true });
  });

  // === Scenarios ===
  app.get("/api/scenarios", (_req, res) => {
    res.json(storage.getScenarios());
  });

  app.post("/api/scenarios", (req, res) => {
    try {
      const data = insertScenarioSchema.parse(req.body);
      const created = storage.createScenario(data);
      res.json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put("/api/scenarios/:id", (req, res) => {
    const id = parseInt(req.params.id);
    const updated = storage.updateScenario(id, req.body);
    if (!updated) return res.status(404).json({ error: "Scenario not found" });
    res.json(updated);
  });

  // === Live Gas Price ===
  app.get("/api/gas-price", async (_req, res) => {
    const settings = storage.getSettings();
    const state = settings?.state || "FL";
    const { price, source } = await fetchGasPrice(state);
    res.json({
      price,
      state,
      unit: "$/gallon",
      fuelType: "Regular Gasoline",
      source,
      lastUpdated: new Date().toISOString(),
    });
  });

  // === Financial Summary / Report Data ===
  app.get("/api/financial-summary", async (_req, res) => {
    const settings = storage.getSettings();
    if (!settings) return res.status(500).json({ error: "No settings configured" });

    const allExpenses = storage.getExpenses().filter((e) => e.isActive);
    const allScenarios = storage.getScenarios();
    const { price: gasPrice, source: gasPriceSource } = await fetchGasPrice(settings.state);

    // ── Driver growth timeline ────────────────────────────────────────────
    const allMilestones = storage.getDriverMilestones()
      .sort((a, b) => a.startMonth - b.startMonth);

    // Build fleet size for each month 1–12
    // Start with settings.fleetSize, then apply milestones forward
    const fleetByMonth: number[] = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      let fleet = settings.fleetSize;
      for (const m of allMilestones) {
        if (m.startMonth <= month) fleet = m.fleetSize;
        else break;
      }
      return fleet;
    });

    // ── Multi-job-type revenue engine ─────────────────────────────────────────
    // Total miles are derived from job types (single source of truth)
    const activeJobTypes = storage.getJobTypes().filter((j) => j.isActive);

    // Compute per-job-type breakdown
    const jobTypeBreakdown = activeJobTypes.map((jt) => {
      const totalMiles = jt.avgMilesPerRun * jt.runsPerMonth;
      const billable = totalMiles * (1 - jt.deadheadPct);
      const rateMultiplier =
        (1 + settings.marginTarget) *
        (1 + settings.marketFactor) *
        (1 + jt.complexityFactor) *
        (1 + jt.urgencyFactor);
      const computedRate = jt.baseRatePerMile * rateMultiplier;
      const lineRevenue = (computedRate + jt.fuelSurchargePerMile) * billable + jt.accessorialPerRun * jt.runsPerMonth;
      return {
        id: jt.id,
        name: jt.name,
        baseRatePerMile: jt.baseRatePerMile,
        computedRatePerMile: Math.round(computedRate * 100) / 100,
        totalRatePerMile: Math.round((computedRate + jt.fuelSurchargePerMile) * 100) / 100,
        avgMilesPerRun: jt.avgMilesPerRun,
        runsPerDriverPerMonth: jt.runsPerMonth,   // per-driver baseline — scales with fleet
        runsPerMonth: jt.runsPerMonth,             // keep for backward compat
        totalMiles,
        billableMiles: Math.round(billable),
        deadheadMiles: Math.round(totalMiles * jt.deadheadPct),
        deadheadPct: jt.deadheadPct,
        complexityFactor: jt.complexityFactor,
        urgencyFactor: jt.urgencyFactor,
        fuelSurchargePerMile: jt.fuelSurchargePerMile,
        accessorialPerRun: jt.accessorialPerRun,
        monthlyRevenue: Math.round(lineRevenue),       // for 1 driver (base fleet)
        revenuePerDriver: Math.round(lineRevenue),     // alias — same as monthlyRevenue (1-driver baseline)
      };
    });

    const computedMonthlyRevenue = jobTypeBreakdown.reduce((s, j) => s + j.monthlyRevenue, 0);
    const jobTypeTotalMiles = jobTypeBreakdown.reduce((s, j) => s + j.totalMiles, 0);
    const jobTypeBillableMiles = jobTypeBreakdown.reduce((s, j) => s + j.billableMiles, 0);

    // Total miles derived from job types (single source of truth for the entire model)
    const totalMilesPerMonth = jobTypeTotalMiles;
    const gallonsPerMonth = totalMilesPerMonth / settings.avgMpg;
    const monthlyFuelCost = gallonsPerMonth * gasPrice;

    // Which revenue to use: job-type model vs flat override
    const effectiveRevenue = settings.useRateModel ? computedMonthlyRevenue : settings.monthlyRevenue;

    // Per-job-type BEP will be computed after expenses are known (see below)

    // Revenue model breakdown
    const revenueModel = {
      jobTypeBreakdown,
      computedMonthlyRevenue: Math.round(computedMonthlyRevenue),
      effectiveRevenue: Math.round(effectiveRevenue),
      usingRateModel: settings.useRateModel,
      marginTarget: settings.marginTarget,
      marketFactor: settings.marketFactor,
      jobTypeTotalMiles,              // per-driver base miles (Month 1)
      jobTypeBillableMiles,
      totalJobTypes: activeJobTypes.length,
      totalRuns: jobTypeBreakdown.reduce((s, j) => s + j.runsPerMonth, 0),  // per-driver base runs
      // Per-month fleet-scaled totals (for Monthly P&L rendering)
      revenueByMonth: fleetByMonth.map((fleet) => Math.round(computedMonthlyRevenue * fleet)),
      milesPerDriverPerMonth: jobTypeTotalMiles,  // base miles for 1 driver
    };

    // Categorize expenses — variable line items scale with miles when ratePerMile is set
    const fixedExpenses = allExpenses.filter((e) => e.category === "fixed");
    const variableExpenses = allExpenses.filter((e) => e.category === "variable");

    const totalFixed = fixedExpenses.reduce((sum, e) => sum + e.amount, 0);

    // For variable expenses: if ratePerMile is set, compute monthly cost = ratePerMile × totalMiles
    // otherwise use the flat amount. Store the computed monthly amount alongside each expense.
    const variableExpensesComputed = variableExpenses.map((e) => ({
      ...e,
      computedAmount: e.ratePerMile != null && e.ratePerMile > 0
        ? e.ratePerMile * totalMilesPerMonth
        : e.amount,
    }));
    const totalVariable = variableExpensesComputed.reduce((sum, e) => sum + e.computedAmount, 0);

    // Fuel is always variable (scales with miles via MPG)
    const totalExpenses = totalFixed + totalVariable + monthlyFuelCost;
    const monthlyProfit = effectiveRevenue - totalExpenses;
    const profitMargin = effectiveRevenue > 0 ? (monthlyProfit / effectiveRevenue) * 100 : 0;

    // ── Break-Even Analysis ──
    // Formula (user-specified): Break-even Rate/Mile = (Fixed + Variable) / Total Miles
    // All variable costs (scaled expenses + fuel) are included as they fluctuate with miles.
    const totalVariableCosts = totalVariable + monthlyFuelCost; // all mile-driven costs
    const totalAllCosts = totalFixed + totalVariableCosts;      // = totalExpenses

    // BEP rate per mile: minimum $/mile to cover all costs
    const breakEvenRatePerMile = totalMilesPerMonth > 0
      ? totalAllCosts / totalMilesPerMonth
      : 0;

    // BEP Revenue: what monthly revenue must be to break even (= total costs, by definition)
    const breakEvenRevenue = totalAllCosts;

    // Unit economics per mile
    const costPerMile = totalMilesPerMonth > 0 ? totalExpenses / totalMilesPerMonth : 0;
    const revenuePerMile = totalMilesPerMonth > 0 ? effectiveRevenue / totalMilesPerMonth : 0;
    const variableCostPerMile = totalMilesPerMonth > 0 ? totalVariableCosts / totalMilesPerMonth : 0;
    const surplusRatePerMile = revenuePerMile - breakEvenRatePerMile; // positive = above BEP

    // BEP miles driven (for reporting: at current rate/mile, how many miles to break even)
    const breakEvenMiles = revenuePerMile > 0
      ? breakEvenRevenue / revenuePerMile
      : 0;

    // Per-job-type BEP — each job type gets its own cost structure:
    //   Allocated Fixed  = totalFixed × (jtMiles / totalMiles)  — overhead proportional to miles driven
    //   Own Variable     = variable expense $/mile × jtMiles  +  fuel $/mile × jtMiles
    //   BEP Rate/Mile    = (Allocated Fixed + Own Variable) ÷ jtMiles
    const fuelCostPerMile = totalMilesPerMonth > 0 ? monthlyFuelCost / totalMilesPerMonth : 0;
    const variableCostPerMileRate = totalMilesPerMonth > 0
      ? variableExpensesComputed
          .filter((e) => e.ratePerMile != null && e.ratePerMile > 0)
          .reduce((sum, e) => sum + (e.ratePerMile ?? 0), 0)
      : 0;
    // Flat variable expenses (not per-mile) are allocated by miles share like fixed costs
    const flatVariableTotal = variableExpensesComputed
      .filter((e) => !e.ratePerMile || e.ratePerMile <= 0)
      .reduce((sum, e) => sum + e.computedAmount, 0);

    const jobTypesWithBEP = jobTypeBreakdown.map((jt) => {
      const milesShare = jobTypeTotalMiles > 0 ? jt.totalMiles / jobTypeTotalMiles : 0;
      // Fixed costs: shared overhead allocated proportionally
      const allocatedFixed = totalFixed * milesShare;
      // Variable costs: per-mile rates scale directly with this job's miles
      const ownVariableCosts =
        (variableCostPerMileRate * jt.totalMiles) +  // per-mile variable expenses
        (fuelCostPerMile * jt.totalMiles) +           // fuel proportional to miles
        (flatVariableTotal * milesShare);              // flat variable allocated by share
      const totalJobCosts = allocatedFixed + ownVariableCosts;
      const bepRatePerMile = jt.totalMiles > 0 ? totalJobCosts / jt.totalMiles : 0;
      // Actual rate: revenue earned per total mile driven (including deadhead)
      const actualRatePerMile = jt.totalMiles > 0 ? jt.monthlyRevenue / jt.totalMiles : 0;
      return {
        ...jt,
        allocatedFixed: Math.round(allocatedFixed),
        ownVariableCosts: Math.round(ownVariableCosts),
        totalJobCosts: Math.round(totalJobCosts),
        bepRatePerMile: Math.round(bepRatePerMile * 100) / 100,
        actualRatePerMile: Math.round(actualRatePerMile * 100) / 100,
        surplusPerMile: Math.round((actualRatePerMile - bepRatePerMile) * 100) / 100,
        isProfitable: actualRatePerMile >= bepRatePerMile,
      };
    });
    // Update the breakdown in revenueModel
    revenueModel.jobTypeBreakdown = jobTypesWithBEP as any;

    // Contribution margin (still useful for FCCR and scenario analysis)
    const contributionMargin = effectiveRevenue - totalVariableCosts;
    const cmRatio = effectiveRevenue > 0 ? contributionMargin / effectiveRevenue : 0;

    // Fixed Charge Coverage Ratio (FCCR) = Revenue / Total Expenses
    const fccr = effectiveRevenue > 0 && totalExpenses > 0
      ? effectiveRevenue / totalExpenses
      : 0;

    // Scenario projections (12 months) — fleet-aware
    // Separate fixed costs into scalable (per-vehicle) vs flat overhead
    const fixedScalable = fixedExpenses
      .filter((e) => (e as any).scalesWithFleet)
      .reduce((s, e) => s + e.amount, 0);
    const fixedFlat = fixedExpenses
      .filter((e) => !(e as any).scalesWithFleet)
      .reduce((s, e) => s + e.amount, 0);

    const scenarioProjections = allScenarios.map((scenario) => {
      const months = [];
      for (let m = 1; m <= 12; m++) {
        const fleet = fleetByMonth[m - 1];           // fleet size this month
        const monthlyGrowth = Math.pow(1 + settings.revenueGrowthRate / 12, m);
        // Revenue: each driver runs the full job mix
        const rev = effectiveRevenue * fleet * scenario.revenueMultiplier * monthlyGrowth;
        const fuelPrice = scenario.fuelPriceOverride || gasPrice;
        // Fuel scales with fleet (more vehicles = more gallons)
        const fuel = gallonsPerMonth * fleet * fuelPrice;
        // Variable costs scale with fleet
        const varCosts = totalVariable * fleet * scenario.expenseMultiplier;
        // Fixed scalable (insurance per vehicle) scales with fleet
        const fixedScaleCosts = fixedScalable * fleet * scenario.expenseMultiplier;
        // Fixed flat (QuickBooks, PO Box) stays constant
        const fixedFlatCosts = fixedFlat * scenario.expenseMultiplier;
        const totalExp = varCosts + fixedScaleCosts + fixedFlatCosts + fuel;
        months.push({
          month: m,
          fleet,
          revenue: Math.round(rev),
          expenses: Math.round(totalExp),
          profit: Math.round(rev - totalExp),
          fuelCost: Math.round(fuel),
        });
      }
      return { name: scenario.name, description: scenario.description, months };
    });

    res.json({
      settings,
      gasPrice,
      gasPriceSource,
      fuelCost: {
        gallonsPerMonth: Math.round(gallonsPerMonth),
        monthlyFuelCost: Math.round(monthlyFuelCost),
        totalMilesPerMonth,
        costPerGallon: gasPrice,
      },
      expenses: {
        fixed: fixedExpenses,
        variable: variableExpensesComputed, // includes computedAmount (ratePerMile × miles or flat)
        totalFixed: Math.round(totalFixed),
        totalVariable: Math.round(totalVariable),
        monthlyFuelCost: Math.round(monthlyFuelCost),
        totalMilesPerMonth,
        totalExpenses: Math.round(totalExpenses),
      },
      profitability: {
        monthlyRevenue: effectiveRevenue,
        totalExpenses: Math.round(totalExpenses),
        monthlyProfit: Math.round(monthlyProfit),
        profitMargin: Math.round(profitMargin * 10) / 10,
        breakEvenRevenue: Math.round(breakEvenRevenue),
        breakEvenRatePerMile: Math.round(breakEvenRatePerMile * 100) / 100,
        breakEvenMiles: Math.round(breakEvenMiles),
        surplusRatePerMile: Math.round(surplusRatePerMile * 100) / 100,
        fccr: Math.round(fccr * 100) / 100,
        contributionMargin: Math.round(contributionMargin),
        cmRatio: Math.round(cmRatio * 10000) / 10000, // 4 decimals for display as %
        totalFixed: Math.round(totalFixed),
        totalVariable: Math.round(totalVariable),
        totalVariableCosts: Math.round(totalVariableCosts),
        costPerMile: Math.round(costPerMile * 100) / 100,
        revenuePerMile: Math.round(revenuePerMile * 100) / 100,
        variableCostPerMile: Math.round(variableCostPerMile * 100) / 100,
      },
      revenueModel,
      driverTimeline: {
        milestones: allMilestones,
        fleetByMonth,         // array of 12 fleet sizes [M1, M2, ..., M12]
        baseFleetSize: settings.fleetSize,
      },
      scenarioProjections,
      annualProjection: {
        revenue: Math.round(effectiveRevenue * 12),
        expenses: Math.round(totalExpenses * 12),
        profit: Math.round(monthlyProfit * 12),
        fuelCost: Math.round(monthlyFuelCost * 12),
      },
    });
  });

  // === Chat / Command Processing ===
  app.get("/api/chat", (_req, res) => {
    res.json(storage.getChatMessages());
  });

  app.post("/api/chat", async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Message required" });

    // Save user message
    storage.createChatMessage({
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
      actionTaken: null,
    });

    // Process command
    const response = await processCommand(message);

    // Save assistant response
    const saved = storage.createChatMessage({
      role: "assistant",
      content: response.message,
      timestamp: new Date().toISOString(),
      actionTaken: response.action ? JSON.stringify(response.action) : null,
    });

    res.json(saved);
  });

  app.delete("/api/chat", (_req, res) => {
    storage.clearChatMessages();
    res.json({ success: true });
  });
}

// Simple NLP-style command processor
async function processCommand(input: string): Promise<{ message: string; action?: any }> {
  const lower = input.toLowerCase().trim();
  const settings = storage.getSettings()!;
  const allExpenses = storage.getExpenses();

  // --- ADD EXPENSE ---
  if (lower.includes("add") && (lower.includes("expense") || lower.includes("cost"))) {
    // Try to parse: "add fixed expense Truck Wash $200"
    const fixedMatch = lower.includes("fixed");
    const variableMatch = lower.includes("variable");
    const category = fixedMatch ? "fixed" : variableMatch ? "variable" : "fixed";

    // Extract dollar amount
    const amountMatch = input.match(/\$?([\d,]+(?:\.\d{1,2})?)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : null;

    // Extract name (everything between category keyword and dollar amount)
    let name = "";
    const nameMatch = input.match(/(?:expense|cost)\s+(?:called\s+|named\s+)?["']?([^"'$]+?)["']?\s*(?:\$|at\s|for\s|[\d]|$)/i);
    if (nameMatch) {
      name = nameMatch[1].trim().replace(/\s+(?:at|for|of)\s*$/i, "").trim();
    }

    if (!amount) {
      return {
        message: `I'd be happy to add an expense. Please specify the amount. For example:\n\n"Add fixed expense Truck Wash $200"\n\nor\n\n"Add variable expense Road Tolls $150"`,
      };
    }

    if (!name) {
      return {
        message: `Got the amount ($${amount}), but I need a name for this expense. Try:\n\n"Add ${category} expense [Name] $${amount}"`,
      };
    }

    const created = storage.createExpense({ name, category, amount, description: "", isActive: true });
    return {
      message: `Done. Added **${name}** as a **${category}** expense at **$${amount.toLocaleString()}/month**.\n\nYour total monthly expenses are now **$${allExpenses.filter(e => e.isActive).reduce((s, e) => s + e.amount, 0) + amount}**.`,
      action: { type: "expense_added", expense: created },
    };
  }

  // --- REMOVE / DELETE EXPENSE ---
  if (lower.includes("remove") || lower.includes("delete")) {
    const expense = allExpenses.find((e) =>
      lower.includes(e.name.toLowerCase())
    );
    if (expense) {
      storage.deleteExpense(expense.id);
      return {
        message: `Removed **${expense.name}** ($${expense.amount}/month) from your expenses.`,
        action: { type: "expense_deleted", id: expense.id, name: expense.name },
      };
    }
    return {
      message: `I couldn't find that expense. Here are your current expenses:\n\n${allExpenses.map((e) => `- ${e.name} ($${e.amount}/mo, ${e.category})`).join("\n")}\n\nTell me the exact name to remove.`,
    };
  }

  // --- UPDATE / CHANGE EXPENSE ---
  if (lower.includes("update") || lower.includes("change") || lower.includes("set") || lower.includes("modify") || lower.includes("adjust")) {
    // Check for revenue updates
    if (lower.includes("revenue")) {
      const amountMatch = input.match(/\$?([\d,]+(?:\.\d{1,2})?)/);
      if (amountMatch) {
        const newRevenue = parseFloat(amountMatch[1].replace(/,/g, ""));
        storage.upsertSettings({ ...settings, monthlyRevenue: newRevenue });
        return {
          message: `Updated monthly revenue to **$${newRevenue.toLocaleString()}**. Your financial projections will update automatically.`,
          action: { type: "revenue_updated", newRevenue },
        };
      }
    }

    // Check for fleet size
    if (lower.includes("fleet") || lower.includes("truck")) {
      const numMatch = input.match(/(\d+)\s*(?:truck|vehicle)/i);
      if (numMatch) {
        const newFleet = parseInt(numMatch[1]);
        storage.upsertSettings({ ...settings, fleetSize: newFleet });
        return {
          message: `Updated fleet size to **${newFleet} trucks**. Fuel cost projections will recalculate based on this.`,
          action: { type: "fleet_updated", newFleet },
        };
      }
    }

    // Check for MPG
    if (lower.includes("mpg") || lower.includes("mileage") || lower.includes("miles per gallon")) {
      const numMatch = input.match(/([\d.]+)\s*(?:mpg|miles)/i);
      if (numMatch) {
        const newMpg = parseFloat(numMatch[1]);
        storage.upsertSettings({ ...settings, avgMpg: newMpg });
        return {
          message: `Updated average fuel efficiency to **${newMpg} MPG**. This directly affects your fuel cost calculations.`,
          action: { type: "mpg_updated", newMpg },
        };
      }
    }

    // Miles are now derived from job types — no direct miles setting
    if (lower.includes("miles") && !lower.includes("mpg")) {
      if (false) { // placeholder — miles come from job types now
        return {
          message: "Miles are now driven by your Job Types in Settings. Adjust runs or miles-per-run there.",
          action: null,
        };
      }
    }

    // Check for growth rate
    if (lower.includes("growth")) {
      const pctMatch = input.match(/([\d.]+)\s*%/);
      if (pctMatch) {
        const newRate = parseFloat(pctMatch[1]) / 100;
        storage.upsertSettings({ ...settings, revenueGrowthRate: newRate });
        return {
          message: `Updated revenue growth rate to **${(newRate * 100).toFixed(1)}%** annually. Scenario projections will reflect this change.`,
          action: { type: "growth_updated", newRate },
        };
      }
    }

    // Check for state
    if (lower.includes("state")) {
      const stateMatch = input.match(/(?:to|=)\s*([A-Z]{2})/i);
      if (stateMatch) {
        const newState = stateMatch[1].toUpperCase();
        storage.upsertSettings({ ...settings, state: newState });
        return {
          message: `Updated state to **${newState}**. Gas prices will now reflect ${newState} pricing.`,
          action: { type: "state_updated", newState },
        };
      }
    }

    // Check for expense amount update
    const expense = allExpenses.find((e) => lower.includes(e.name.toLowerCase()));
    if (expense) {
      const amountMatch = input.match(/\$?([\d,]+(?:\.\d{1,2})?)/);
      if (amountMatch) {
        const newAmount = parseFloat(amountMatch[1].replace(/,/g, ""));
        storage.updateExpense(expense.id, { amount: newAmount });
        return {
          message: `Updated **${expense.name}** from $${expense.amount}/mo to **$${newAmount.toLocaleString()}/mo**.`,
          action: { type: "expense_updated", id: expense.id, name: expense.name, oldAmount: expense.amount, newAmount },
        };
      }
    }

    return {
      message: `I can update these items:\n\n- **Revenue**: "Set revenue to $60,000"\n- **Fleet size**: "Change to 5 trucks"\n- **MPG**: "Update MPG to 15"\n- **Miles/truck**: "Set miles to 4,000 miles"\n- **Growth rate**: "Set growth to 8%"\n- **State**: "Change state to TX"\n- **Any expense**: "Update Truck Lease to $2,500"\n\nWhat would you like to change?`,
    };
  }

  // --- SHOW / LIST EXPENSES ---
  if (lower.includes("show") || lower.includes("list") || lower.includes("what are")) {
    if (lower.includes("expense") || lower.includes("cost")) {
      const fixed = allExpenses.filter((e) => e.category === "fixed" && e.isActive);
      const variable = allExpenses.filter((e) => e.category === "variable" && e.isActive);

      const { price: gasPrice } = await fetchGasPrice(settings.state);
      const jtMiles = storage.getJobTypes().filter(j => j.isActive).reduce((s, j) => s + j.avgMilesPerRun * j.runsPerMonth, 0);
      const gallons = jtMiles / settings.avgMpg;
      const fuelCost = gallons * gasPrice;

      let msg = `**Your Monthly Expenses:**\n\n**Fixed Expenses:**\n`;
      fixed.forEach((e) => (msg += `- ${e.name}: $${e.amount.toLocaleString()}\n`));
      msg += `\n**Variable Expenses:**\n`;
      variable.forEach((e) => (msg += `- ${e.name}: $${e.amount.toLocaleString()}\n`));
      msg += `\n**Fuel (Live):** $${Math.round(fuelCost).toLocaleString()} (${Math.round(gallons)} gal × $${gasPrice.toFixed(2)}/gal)\n`;
      msg += `\n**Total: $${Math.round(allExpenses.reduce((s, e) => s + (e.isActive ? e.amount : 0), 0) + fuelCost).toLocaleString()}/month**`;
      return { message: msg };
    }

    if (lower.includes("scenario")) {
      const scenarios = storage.getScenarios();
      let msg = `**Your Scenarios:**\n\n`;
      scenarios.forEach((s) => {
        msg += `- **${s.name}**: Revenue ×${s.revenueMultiplier}, Expenses ×${s.expenseMultiplier}${s.fuelPriceOverride ? ` (fuel @ $${s.fuelPriceOverride})` : " (live fuel)"} — ${s.description}\n`;
      });
      return { message: msg };
    }

    if (lower.includes("setting") || lower.includes("config")) {
      const milesFromJobTypes = storage
        .getJobTypes()
        .filter((j) => j.isActive)
        .reduce((s, j) => s + j.avgMilesPerRun * j.runsPerMonth, 0);
      return {
        message: `**Business Settings:**\n\n- Business: ${settings.businessName}\n- State: ${settings.state}\n- Fleet: ${settings.fleetSize} trucks\n- Avg Miles/Truck/Month: ${milesFromJobTypes.toLocaleString()}\n- Avg MPG: ${settings.avgMpg}\n- Monthly Revenue: $${settings.monthlyRevenue.toLocaleString()}\n- Growth Rate: ${(settings.revenueGrowthRate * 100).toFixed(1)}%/year`,
      };
    }
  }

  // --- GAS PRICE ---
  if (lower.includes("gas") || lower.includes("fuel") || lower.includes("gallon")) {
    const { price, source: priceSource } = await fetchGasPrice(settings.state);
    const jtMiles = storage.getJobTypes().filter(j => j.isActive).reduce((s, j) => s + j.avgMilesPerRun * j.runsPerMonth, 0);
      const gallons = jtMiles / settings.avgMpg;
    const monthlyCost = gallons * price;
    return {
      message: `**Current Gas Price (${settings.state}):** $${price.toFixed(2)}/gallon *(${priceSource})*\n\nYour fleet burns approximately **${Math.round(gallons)} gallons/month** across ${settings.fleetSize} trucks.\n\n**Monthly fuel cost: $${Math.round(monthlyCost).toLocaleString()}**\n\nThis is a live expense that updates with market prices.`,
    };
  }

  // --- PROFIT / SUMMARY ---
  if (lower.includes("profit") || lower.includes("margin") || lower.includes("summary") || lower.includes("bottom line") || lower.includes("how am i doing") || lower.includes("overview")) {
    const { price: gasPrice } = await fetchGasPrice(settings.state);
    const jtMiles = storage.getJobTypes().filter(j => j.isActive).reduce((s, j) => s + j.avgMilesPerRun * j.runsPerMonth, 0);
      const gallons = jtMiles / settings.avgMpg;
    const fuelCost = gallons * gasPrice;
    const totalExpenses = allExpenses.filter(e => e.isActive).reduce((s, e) => s + e.amount, 0) + fuelCost;
    const profit = settings.monthlyRevenue - totalExpenses;
    const margin = ((profit / settings.monthlyRevenue) * 100).toFixed(1);

    return {
      message: `**Monthly P&L Summary:**\n\n| | Amount |\n|---|---|\n| Revenue | $${settings.monthlyRevenue.toLocaleString()} |\n| Fixed Expenses | $${allExpenses.filter(e => e.category === "fixed" && e.isActive).reduce((s, e) => s + e.amount, 0).toLocaleString()} |\n| Variable Expenses | $${allExpenses.filter(e => e.category === "variable" && e.isActive).reduce((s, e) => s + e.amount, 0).toLocaleString()} |\n| Fuel (Live) | $${Math.round(fuelCost).toLocaleString()} |\n| **Total Expenses** | **$${Math.round(totalExpenses).toLocaleString()}** |\n| **Net Profit** | **$${Math.round(profit).toLocaleString()}** |\n| **Margin** | **${margin}%** |\n\n${profit > 0 ? "Your operation is profitable." : "Warning: You're operating at a loss. Consider reducing costs or increasing revenue."}`,
    };
  }

  // --- HELP ---
  if (lower.includes("help") || lower === "?" || lower.includes("what can you do")) {
    return {
      message: `I can help you manage your logistics financial model. Try these commands:\n\n**Expenses:**\n- "Add fixed expense Truck Wash $200"\n- "Add variable expense Emergency Repairs $500"\n- "Remove Truck Wash"\n- "Update Truck Lease to $2,500"\n- "Show my expenses"\n\n**Business Settings:**\n- "Set revenue to $60,000"\n- "Change to 5 trucks"\n- "Update MPG to 15"\n- "Set miles to 4,000 miles"\n- "Change state to TX"\n\n**Analysis:**\n- "Show me my profit"\n- "What's the gas price?"\n- "Show scenarios"\n- "How am I doing?"\n\nJust type naturally — I'll figure out what you need.`,
    };
  }

  // --- DEFAULT ---
  return {
    message: `I'm not sure what you're asking. Here are some things I can help with:\n\n- **Add/remove/update expenses** — "Add fixed expense Parking $300"\n- **Change business settings** — "Set revenue to $60,000"\n- **Check gas prices** — "What's the current gas price?"\n- **View profit summary** — "Show me my profit"\n- **Manage scenarios** — "Show scenarios"\n\nType **"help"** for the full list of commands.`,
  };
}

