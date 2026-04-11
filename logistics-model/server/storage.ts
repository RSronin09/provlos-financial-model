import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import {
  businessSettings,
  expenses,
  scenarios,
  jobTypes,
  driverMilestones,
  chatMessages,
  type InsertBusinessSettings,
  type BusinessSettings,
  type InsertExpense,
  type Expense,
  type InsertScenario,
  type Scenario,
  type InsertJobType,
  type JobType,
  type InsertDriverMilestone,
  type DriverMilestone,
  type InsertChatMessage,
  type ChatMessage,
} from "@shared/schema";

const sqlite = new Database("data.db");
const db = drizzle(sqlite);

// ── Schema migrations (add columns if they don't exist yet) ──
try { sqlite.exec(`ALTER TABLE business_settings ADD COLUMN truck_down_payment REAL NOT NULL DEFAULT 5000`); } catch {}
try { sqlite.exec(`ALTER TABLE business_settings ADD COLUMN monthly_lease_payment REAL NOT NULL DEFAULT 800`); } catch {}

export interface IStorage {
  // Business Settings
  getSettings(): BusinessSettings | undefined;
  upsertSettings(data: InsertBusinessSettings): BusinessSettings;

  // Expenses
  getExpenses(): Expense[];
  getExpense(id: number): Expense | undefined;
  createExpense(data: InsertExpense): Expense;
  updateExpense(id: number, data: Partial<InsertExpense>): Expense | undefined;
  deleteExpense(id: number): void;

  // Scenarios
  getScenarios(): Scenario[];
  getScenario(id: number): Scenario | undefined;
  createScenario(data: InsertScenario): Scenario;
  updateScenario(id: number, data: Partial<InsertScenario>): Scenario | undefined;
  deleteScenario(id: number): void;

  // Driver Milestones
  getDriverMilestones(): DriverMilestone[];
  createDriverMilestone(data: InsertDriverMilestone): DriverMilestone;
  updateDriverMilestone(id: number, data: Partial<InsertDriverMilestone>): DriverMilestone | undefined;
  deleteDriverMilestone(id: number): void;

  // Job Types
  getJobTypes(): JobType[];
  getJobType(id: number): JobType | undefined;
  createJobType(data: InsertJobType): JobType;
  updateJobType(id: number, data: Partial<InsertJobType>): JobType | undefined;
  deleteJobType(id: number): void;

  // Chat
  getChatMessages(): ChatMessage[];
  createChatMessage(data: InsertChatMessage): ChatMessage;
  clearChatMessages(): void;
}

export class DatabaseStorage implements IStorage {
  // Business Settings
  getSettings(): BusinessSettings | undefined {
    return db.select().from(businessSettings).get();
  }

  upsertSettings(data: InsertBusinessSettings): BusinessSettings {
    const existing = this.getSettings();
    if (existing) {
      db.update(businessSettings).set(data).where(eq(businessSettings.id, existing.id)).run();
      return db.select().from(businessSettings).where(eq(businessSettings.id, existing.id)).get()!;
    }
    return db.insert(businessSettings).values(data).returning().get();
  }

  // Expenses
  getExpenses(): Expense[] {
    return db.select().from(expenses).all();
  }

  getExpense(id: number): Expense | undefined {
    return db.select().from(expenses).where(eq(expenses.id, id)).get();
  }

  createExpense(data: InsertExpense): Expense {
    return db.insert(expenses).values(data).returning().get();
  }

  updateExpense(id: number, data: Partial<InsertExpense>): Expense | undefined {
    db.update(expenses).set(data).where(eq(expenses.id, id)).run();
    return this.getExpense(id);
  }

  deleteExpense(id: number): void {
    db.delete(expenses).where(eq(expenses.id, id)).run();
  }

  // Scenarios
  getScenarios(): Scenario[] {
    return db.select().from(scenarios).all();
  }

  getScenario(id: number): Scenario | undefined {
    return db.select().from(scenarios).where(eq(scenarios.id, id)).get();
  }

  createScenario(data: InsertScenario): Scenario {
    return db.insert(scenarios).values(data).returning().get();
  }

  updateScenario(id: number, data: Partial<InsertScenario>): Scenario | undefined {
    db.update(scenarios).set(data).where(eq(scenarios.id, id)).run();
    return this.getScenario(id);
  }

  deleteScenario(id: number): void {
    db.delete(scenarios).where(eq(scenarios.id, id)).run();
  }

  // Driver Milestones
  getDriverMilestones(): DriverMilestone[] {
    return db.select().from(driverMilestones).orderBy(driverMilestones.startMonth).all();
  }

  createDriverMilestone(data: InsertDriverMilestone): DriverMilestone {
    return db.insert(driverMilestones).values(data).returning().get();
  }

  updateDriverMilestone(id: number, data: Partial<InsertDriverMilestone>): DriverMilestone | undefined {
    db.update(driverMilestones).set(data).where(eq(driverMilestones.id, id)).run();
    return db.select().from(driverMilestones).where(eq(driverMilestones.id, id)).get();
  }

  deleteDriverMilestone(id: number): void {
    db.delete(driverMilestones).where(eq(driverMilestones.id, id)).run();
  }

  // Job Types
  getJobTypes(): JobType[] {
    return db.select().from(jobTypes).all();
  }

  getJobType(id: number): JobType | undefined {
    return db.select().from(jobTypes).where(eq(jobTypes.id, id)).get();
  }

  createJobType(data: InsertJobType): JobType {
    return db.insert(jobTypes).values(data).returning().get();
  }

  updateJobType(id: number, data: Partial<InsertJobType>): JobType | undefined {
    db.update(jobTypes).set(data).where(eq(jobTypes.id, id)).run();
    return this.getJobType(id);
  }

  deleteJobType(id: number): void {
    db.delete(jobTypes).where(eq(jobTypes.id, id)).run();
  }

  // Chat
  getChatMessages(): ChatMessage[] {
    return db.select().from(chatMessages).all();
  }

  createChatMessage(data: InsertChatMessage): ChatMessage {
    return db.insert(chatMessages).values(data).returning().get();
  }

  clearChatMessages(): void {
    db.delete(chatMessages).run();
  }
}

export const storage = new DatabaseStorage();

// Seed default data
function seedDefaults() {
  const settings = storage.getSettings();
  if (!settings) {
    storage.upsertSettings({
      businessName: "My Logistics Co",
      state: "FL",
      fleetSize: 3,
      avgMpg: 12,
      monthlyRevenue: 50000,
      revenueGrowthRate: 0.05,
    });
  }

  const existingExpenses = storage.getExpenses();
  if (existingExpenses.length === 0) {
    // Seed default fixed expenses
    storage.createExpense({ name: "Truck Lease Payments", category: "fixed", amount: 2200, description: "Monthly lease per truck", isActive: true });
    storage.createExpense({ name: "Commercial Insurance", category: "fixed", amount: 1800, description: "Liability + cargo insurance per truck", isActive: true });
    storage.createExpense({ name: "Registration & Permits", category: "fixed", amount: 250, description: "DOT, state permits, registration", isActive: true });
    storage.createExpense({ name: "GPS/Telematics", category: "fixed", amount: 150, description: "Fleet tracking subscription", isActive: true });
    storage.createExpense({ name: "Office & Admin", category: "fixed", amount: 1200, description: "Office rent, software, phone", isActive: true });
    storage.createExpense({ name: "Driver Wages", category: "fixed", amount: 8500, description: "Base wages for drivers (total fleet)", isActive: true });

    // Seed default variable expenses
    storage.createExpense({ name: "Maintenance & Repairs", category: "variable", amount: 800, description: "Avg monthly across fleet", isActive: true });
    storage.createExpense({ name: "Tires", category: "variable", amount: 400, description: "Monthly tire budget", isActive: true });
    storage.createExpense({ name: "Tolls & Parking", category: "variable", amount: 350, description: "Route-dependent tolls", isActive: true });
    storage.createExpense({ name: "Driver Overtime / Bonuses", category: "variable", amount: 600, description: "Performance bonuses, overtime", isActive: true });
  }

  const existingScenarios = storage.getScenarios();
  if (existingScenarios.length === 0) {
    storage.createScenario({ name: "Best Case", revenueMultiplier: 1.2, expenseMultiplier: 0.9, fuelPriceOverride: null, description: "Higher demand, efficient operations" });
    storage.createScenario({ name: "Base Case", revenueMultiplier: 1.0, expenseMultiplier: 1.0, fuelPriceOverride: null, description: "Current trajectory" });
    storage.createScenario({ name: "Worst Case", revenueMultiplier: 0.8, expenseMultiplier: 1.15, fuelPriceOverride: null, description: "Recession, lower demand, higher costs" });
  }
}

seedDefaults();
