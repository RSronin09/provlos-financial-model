import serverless from "serverless-http";
import { initializeApp } from "../../logistics-model/server/bootstrap";

let cached: ReturnType<typeof serverless> | null = null;

export default async function handler(req: any, res: any) {
  if (!cached) {
    const { app } = await initializeApp();
    cached = serverless(app);
  }
  return cached(req, res);
}
