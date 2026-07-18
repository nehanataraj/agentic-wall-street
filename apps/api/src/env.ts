import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_ADMIN_URL: z.string().url().optional(),
  ASSIGNMENT_SALT: z.string().length(64, "ASSIGNMENT_SALT must be 64 hex chars"),
  SERVER_SIGNING_SEED: z.string().length(64, "SERVER_SIGNING_SEED must be 64 hex chars"),
  OIDC_ISSUER: z.string().url(),
  OIDC_AUDIENCE: z.string(),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  TWELVE_DATA_API_KEY: z.string().optional(),
  EIA_API_KEY: z.string().optional(),
  ALPHA_VANTAGE_API_KEY: z.string().optional(),
  MERKLE_S3_ENDPOINT: z.string().optional(),
  MERKLE_S3_BUCKET: z.string().optional(),
  MERKLE_S3_REGION: z.string().optional(),
  MERKLE_S3_ACCESS_KEY: z.string().optional(),
  MERKLE_S3_SECRET_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Environment validation failed:\n${issues}`);
  }
  _env = result.data;
  return _env;
}
