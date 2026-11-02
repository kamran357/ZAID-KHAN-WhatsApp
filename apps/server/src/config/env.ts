// Load the server package .env explicitly via createRequire so it works
// regardless of cwd or tsx dotenv injection: env.ts lives in src/config/,
// so the .env sits ONE level up (../.env = apps/server/.env).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const serverEnvPath = join(__dirname, "..", "..", ".env");
require("dotenv").config({ path: serverEnvPath });
if (!process.env.DATABASE_URL) require("dotenv").config({ path: serverEnvPath, override: true });

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().default("file:./data/zaidkhan.db"),
  AUTH_PASSWORD: z.string().min(4).default("zaidkhan"),
  APP_ENCRYPTION_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("[env] invalid environment", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
