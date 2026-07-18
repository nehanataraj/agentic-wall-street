import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_ADMIN_URL"] ?? process.env["DATABASE_URL"]!,
  },
  verbose: true,
  strict: true,
});
