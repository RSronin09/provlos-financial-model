import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Business settings
export const businessSettings = sqliteTable("business_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  businessName: text("business_name").notNull().default("My Logistics Co"),
  state: text("state").notNull().default("FL"),
  fleetSize: integer("fleet_size").notNull().default(3),
  avgMpg: real("avg_mpg").notNull().default(12), // miles per gallon — still needed for fuel cost calc
  monthlyRevenue: real("monthly_revenue").notNull().default(50000),
  revenueGrowthRate: real("revenue_growth_rate").notNull().default(0.05), // 5% per year
  useOfProceeds: text("use_of_proceeds").default(""), // freeform financing narrative

  // ── Revenue Model (rate-per-mile engine) ──────────────────────────────────
  // When useRateModel = 1, monthly revenue is COMPUTED from rate inputs;
  // when 0, the legacy flat monthlyRevenue input is used directly.
  useRateModel: integer("use_rate_model", { mode: "boolean" }).notNull().default(false),
  baseRatePerMile: real("base_rate_per_mile").notNull().default(2.40),        // $/mile
  marginTarget: real("margin_target").notNull().default(0.20),                 // 20% profit margin
  marketFactor: real("market_factor").notNull().default(0.05),                 // +5% balanced market
  loadComplexityFactor: real("load_complexity_factor").notNull().default(0.0), // 0% standard load
  urgencyFactor: real("urgency_factor").notNull().default(0.0),                // 0% standard freight
  deadheadPct: real("deadhead_pct").notNull().default(0.15),                  // 15% unpaid miles
  fuelSurchargePerMile: real("fuel_surcharge_per_mile").notNull().default(0.45), // $/mile
  accessorialPerMonth: real("accessorial_per_month").notNull().default(0.0),  // detention/layover/$
});

export const insertBusinessSettingsSchema = createInsertSchema(businessSettings).omit({ id: true });
export type InsertBusinessSettings = z.infer<typeof insertBusinessSettingsSchema>;
export type BusinessSettings = typeof businessSettings.$inferSelect;

// Expenses
export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(), // "fixed" | "variable"
  amount: real("amount").notNull(), // monthly flat amount (used when ratePerMile is null/0)
  ratePerMile: real("rate_per_mile").default(null), // $/mile — when set, monthly cost = ratePerMile × totalMiles
  scalesWithFleet: integer("scales_with_fleet", { mode: "boolean" }).notNull().default(false), // true = multiplied by fleet size
  description: text("description").default(""),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

// Scenarios
export const scenarios = sqliteTable("scenarios", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(), // "best" | "base" | "worst"
  revenueMultiplier: real("revenue_multiplier").notNull().default(1.0),
  expenseMultiplier: real("expense_multiplier").notNull().default(1.0),
  fuelPriceOverride: real("fuel_price_override"), // null means use live price
  description: text("description").default(""),
});

export const insertScenarioSchema = createInsertSchema(scenarios).omit({ id: true });
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type Scenario = typeof scenarios.$inferSelect;

// Driver Growth Milestones — defines fleet size at each month
export const driverMilestones = sqliteTable("driver_milestones", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startMonth: integer("start_month").notNull(),   // 1–12: month this fleet size takes effect
  fleetSize: integer("fleet_size").notNull(),      // total drivers/vehicles from this month forward
  note: text("note").default(""),                   // optional label e.g. "Hire Driver 2"
});

export const insertDriverMilestoneSchema = createInsertSchema(driverMilestones).omit({ id: true });
export type InsertDriverMilestone = z.infer<typeof insertDriverMilestoneSchema>;
export type DriverMilestone = typeof driverMilestones.$inferSelect;

// Job Types — each represents a recurring delivery type with its own pricing
export const jobTypes = sqliteTable("job_types", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),                                      // e.g. "Standard Dry Van", "Heavy Load"
  baseRatePerMile: real("base_rate_per_mile").notNull().default(2.40), // $/mile starting rate
  avgMilesPerRun: real("avg_miles_per_run").notNull().default(200),    // miles per delivery
  runsPerMonth: integer("runs_per_month").notNull().default(4),        // how many of these per month
  complexityFactor: real("complexity_factor").notNull().default(0.0),  // +X% for heavy/oversized/fragile
  urgencyFactor: real("urgency_factor").notNull().default(0.0),        // +X% for expedited/hotshot
  deadheadPct: real("deadhead_pct").notNull().default(0.15),           // % of miles empty/unpaid
  fuelSurchargePerMile: real("fuel_surcharge_per_mile").notNull().default(0.45), // $/mile
  accessorialPerRun: real("accessorial_per_run").notNull().default(0), // detention/layover per delivery
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
});

export const insertJobTypeSchema = createInsertSchema(jobTypes).omit({ id: true });
export type InsertJobType = z.infer<typeof insertJobTypeSchema>;
export type JobType = typeof jobTypes.$inferSelect;

// Chat messages
export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role").notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  timestamp: text("timestamp").notNull(),
  actionTaken: text("action_taken"), // JSON string describing what action was performed
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
