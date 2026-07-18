import express, { type Express } from "express";
import { createAppDb } from "@app/db";
import { createClaimRouter } from "./routes/claims.js";
import { createFeedRouter } from "./routes/feed.js";
import { createRegistryRouter } from "./routes/registry.js";
import { createMerkleRouter } from "./routes/merkle.js";
import { createMcpRouter } from "./mcp.js";
import { getEnv } from "./env.js";

const env = getEnv();
const db = createAppDb(env.DATABASE_URL);

const app: Express = express();

// Security headers
app.use((_req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "DENY");
  res.set("Referrer-Policy", "no-referrer");
  res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  next();
});

// Host / Origin validation (SSRF defense)
app.use((req, res, next) => {
  const host = req.get("host") ?? "";
  const allowedHosts = [
    `localhost:${env.PORT}`,
    `127.0.0.1:${env.PORT}`,
    // Add production hostname via env
    process.env["ALLOWED_HOST"] ?? "",
  ].filter(Boolean);
  if (env.NODE_ENV === "production" && !allowedHosts.some((h) => host === h)) {
    res.status(400).json({ error: "invalid_host" });
    return;
  }
  next();
});

app.use(express.json({ limit: "64kb" }));

// Health / readiness
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/ready", async (_req, res) => {
  try {
    await db.execute("SELECT 1" as unknown as Parameters<typeof db.execute>[0]);
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// OAuth protected resource metadata (RFC 9728)
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  const base = process.env["API_BASE_URL"] ?? `http://localhost:${env.PORT}`;
  res.json({
    resource: base,
    authorization_servers: [env.OIDC_ISSUER],
    scopes_supported: ["feed:read", "claim:write", "registry:write"],
    bearer_methods_supported: ["header"],
  });
});

// Routes
app.use("/v1/claims", createClaimRouter(db));
app.use("/v1/feed", createFeedRouter(db));
app.use("/v1/registry", createRegistryRouter(db));
app.use("/v1/merkle", createMerkleRouter(db));
app.use("/v1/mcp", createMcpRouter(db));

// Catch-all 404
app.use((_req, res) => res.status(404).json({ error: "not_found" }));

// Structured error handler
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(env.PORT, () => {
  console.log(JSON.stringify({ level: "info", msg: `API listening on :${env.PORT}` }));
});

export default app;
