import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
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

const client = createClient({
  url: process.env.TURSO_DATABASE_URL ?? "file:local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

// ── Schema migrations (add columns if they don't exist yet) ──
async function runMigrations() {
  try { await client.execute(`ALTER TABLE business_settings ADD COLUMN truck_down_payment REAL NOT NULL DEFAULT 5000`); } catch {}
  try { await client.execute(`ALTER TABLE business_settings ADD COLUMN monthly_lease_payment REAL NOT NULL DEFAULT 800`); } catch {}
}
// Migrations run lazily via ensureSeeded() — not at module load time

export interface IStorage {
  getSettings(): Promise<BusinessSettings | undefined>;
  upsertSettings(data: InsertBusinessSettings): Promise<BusinessSettings>;
  getExpenses(): Promise<Expense[]>;
  getExpense(id: number): Promise<Expense | undefined>;
  createExpense(data: InsertExpense): Promise<Expense>;
  updateExpense(id: number, data: Partial<InsertExpense>): Promise<Expense | undefined>;
  deleteExpense(id: number): Promise<void>;
  getScenarios(): Promise<Scenario[]>;
  getScenario(id: number): Promise<Scenario | undefined>;
  createScenario(data: InsertScenario): Promise<Scenario>;
  updateScenario(id: number, data: Partial<InsertScenario>): Promise<Scenario | undefined>;
  deleteScenario(id: number): Promise<void>;
  getDriverMilestones(): Promise<DriverMilestone[]>;
  createDriverMilestone(data: InsertDriverMilestone): Promise<DriverMilestone>;
  updateDriverMilestone(id: number, data: Partial<InsertDriverMilestone>): Promise<DriverMilestone | undefined>;
  deleteDriverMilestone(id: number): Promise<void>;
  getJobTypes(): Promise<JobType[]>;
  getJobType(id: number): Promise<JobType | undefined>;
  createJobType(data: InsertJobType): Promise<JobType>;
  updateJobType(id: number, data: Partial<InsertJobType>): Promise<JobType | undefined>;
  deleteJobType(id: number): Promise<void>;
  getChatMessages(): Promise<ChatMessage[]>;
  createChatMessage(data: InsertChatMessage): Promise<ChatMessage>;
  clearChatMessages(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getSettings(): Promise<BusinessSettings | undefined> {
    const rows = await db.select().from(businessSettings).limit(1);
    return rows[0];
  }

  async upsertSettings(data: InsertBusinessSettings): Promise<BusinessSettings> {
    const existing = await this.getSettings();
    if (existing) {
      await db.update(businessSettings).set(data).where(eq(businessSettings.id, existing.id));
      const rows = await db.select().from(businessSettings).where(eq(businessSettings.id, existing.id));
      return rows[0]!;
    }
    const rows = await db.insert(businessSettings).values(data).returning();
    return rows[0]!;
  }

  async getExpenses(): Promise<Expense[]> {
    return db.select().from(expenses);
  }

  async getExpense(id: number): Promise<Expense | undefined> {
    const rows = await db.select().from(expenses).where(eq(expenses.id, id));
    return rows[0];
  }

  async createExpense(data: InsertExpense): Promise<Expense> {
    const rows = await db.insert(expenses).values(data).returning();
    return rows[0]!;
  }

  async updateExpense(id: number, data: Partial<InsertExpense>): Promise<Expense | undefined> {
    await db.update(expenses).set(data).where(eq(expenses.id, id));
    return this.getExpense(id);
  }

  async deleteExpense(id: number): Promise<void> {
    await db.delete(expenses).where(eq(expenses.id, id));
  }

  async getScenarios(): Promise<Scenario[]> {
    return db.select().from(scenarios);
  }

  async getScenario(id: number): Promise<Scenario | undefined> {
    const rows = await db.select().from(scenarios).where(eq(scenarios.id, id));
    return rows[0];
  }

  async createScenario(data: InsertScenario): Promise<Scenario> {
    const rows = await db.insert(scenarios).values(data).returning();
    return rows[0]!;
  }

  async updateScenario(id: number, data: Partial<InsertScenario>): Promise<Scenario | undefined> {
    await db.update(scenarios).set(data).where(eq(scenarios.id, id));
    return this.getScenario(id);
  }

  async deleteScenario(id: number): Promise<void> {
    await db.delete(scenarios).where(eq(scenarios.id, id));
  }

  async getDriverMilestones(): Promise<DriverMilestone[]> {
    return db.select().from(driverMilestones).orderBy(driverMilestones.startMonth);
  }

  async createDriverMilestone(data: InsertDriverMilestone): Promise<DriverMilestone> {
    const rows = await db.insert(driverMilestones).values(data).returning();
    return rows[0]!;
  }

  async updateDriverMilestone(id: number, data: Partial<InsertDriverMilestone>): Promise<DriverMilestone | undefined> {
    await db.update(driverMilestones).set(data).where(eq(driverMilestones.id, id));
    const rows = await db.select().from(driverMilestones).where(eq(driverMilestones.id, id));
    return rows[0];
  }

  async deleteDriverMilestone(id: number): Promise<void> {
    await db.delete(driverMilestones).where(eq(driverMilestones.id, id));
  }

  async getJobTypes(): Promise<JobType[]> {
    return db.select().from(jobTypes);
  }

  async getJobType(id: number): Promise<JobType | undefined> {
    const rows = await db.select().from(jobTypes).where(eq(jobTypes.id, id));
    return rows[0];
  }

  async createJobType(data: InsertJobType): Promise<JobType> {
    const rows = await db.insert(jobTypes).values(data).returning();
    return rows[0]!;
  }

  async updateJobType(id: number, data: Partial<InsertJobType>): Promise<JobType | undefined> {
    await db.update(jobTypes).set(data).where(eq(jobTypes.id, id));
    return this.getJobType(id);
  }

  async deleteJobType(id: number): Promise<void> {
    await db.delete(jobTypes).where(eq(jobTypes.id, id));
  }

  async getChatMessages(): Promise<ChatMessage[]> {
    return db.select().from(chatMessages);
  }

  async createChatMessage(data: InsertChatMessage): Promise<ChatMessage> {
    const rows = await db.insert(chatMessages).values(data).returning();
    return rows[0]!;
  }

  async clearChatMessages(): Promise<void> {
    await db.delete(chatMessages);
  }
}

export const storage = new DatabaseStorage();

// Seed default data on first run — runs lazily on first request to avoid
// blocking the serverless function cold start with multiple sequential DB calls.
let seedPromise: Promise<void> | null = null;

async function seedDefaults() {
  await runMigrations();
  const settings = await storage.getSettings();
  if (!settings) {
    await storage.upsertSettings({
      businessName: "My Logistics Co",
      state: "FL",
      fleetSize: 3,
      avgMpg: 12,
      monthlyRevenue: 50000,
      revenueGrowthRate: 0.05,
    });
  }

  const existingExpenses = await storage.getExpenses();
  if (existingExpenses.length === 0) {
    await storage.createExpense({ name: "Truck Lease Payments", category: "fixed", amount: 2200, description: "Monthly lease per truck", isActive: true });
    await storage.createExpense({ name: "Commercial Insurance", category: "fixed", amount: 1800, description: "Liability + cargo insurance per truck", isActive: true });
    await storage.createExpense({ name: "Registration & Permits", category: "fixed", amount: 250, description: "DOT, state permits, registration", isActive: true });
    await storage.createExpense({ name: "GPS/Telematics", category: "fixed", amount: 150, description: "Fleet tracking subscription", isActive: true });
    await storage.createExpense({ name: "Office & Admin", category: "fixed", amount: 1200, description: "Office rent, software, phone", isActive: true });
    await storage.createExpense({ name: "Driver Wages", category: "fixed", amount: 8500, description: "Base wages for drivers (total fleet)", isActive: true });
    await storage.createExpense({ name: "Maintenance & Repairs", category: "variable", amount: 800, description: "Avg monthly across fleet", isActive: true });
    await storage.createExpense({ name: "Tires", category: "variable", amount: 400, description: "Monthly tire budget", isActive: true });
    await storage.createExpense({ name: "Tolls & Parking", category: "variable", amount: 350, description: "Route-dependent tolls", isActive: true });
    await storage.createExpense({ name: "Driver Overtime / Bonuses", category: "variable", amount: 600, description: "Performance bonuses, overtime", isActive: true });
  }

  const existingScenarios = await storage.getScenarios();
  if (existingScenarios.length === 0) {
    await storage.createScenario({ name: "Best Case", revenueMultiplier: 1.2, expenseMultiplier: 0.9, fuelPriceOverride: null, description: "Higher demand, efficient operations" });
    await storage.createScenario({ name: "Base Case", revenueMultiplier: 1.0, expenseMultiplier: 1.0, fuelPriceOverride: null, description: "Current trajectory" });
    await storage.createScenario({ name: "Worst Case", revenueMultiplier: 0.8, expenseMultiplier: 1.15, fuelPriceOverride: null, description: "Recession, lower demand, higher costs" });
  }
}

export function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedDefaults().catch(console.error) as Promise<void>;
  }
  return seedPromise;
}
