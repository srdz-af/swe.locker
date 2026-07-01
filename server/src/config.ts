import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  CLIENT_ORIGIN: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  FETCH_INTERVAL_HOURS: z.coerce.number().int().positive().default(1),
  SOURCE_CACHE_DIR: z.string().trim().min(1).default(".cache/sources"),
  RAW_README_URL: z
    .string()
    .url()
    .default("https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/README.md"),
  SEASON_LABEL: z.string().default("Summer 2026"),
  SERVER_PORT: z.coerce.number().int().positive().default(4000),
  SOURCE_DISPLAY_NAME: z.string().default("SimplifyJobs Summer 2026 Internships"),
  SOURCE_REPOSITORY_URL: z
    .string()
    .url()
    .default("https://github.com/SimplifyJobs/Summer2026-Internships")
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  throw new Error(`Invalid environment configuration: ${JSON.stringify(parsedEnv.error.flatten().fieldErrors)}`);
}

const env = parsedEnv.data;

export const config = {
  clientOrigin: env.CLIENT_ORIGIN,
  databaseUrl: env.DATABASE_URL,
  fetchIntervalHours: env.FETCH_INTERVAL_HOURS,
  rawReadmeUrl: env.RAW_README_URL,
  seasonLabel: env.SEASON_LABEL,
  serverPort: env.SERVER_PORT,
  sourceDisplayName: env.SOURCE_DISPLAY_NAME,
  sourceRepositoryUrl: env.SOURCE_REPOSITORY_URL,
  sourceCacheDir: env.SOURCE_CACHE_DIR
} as const;
