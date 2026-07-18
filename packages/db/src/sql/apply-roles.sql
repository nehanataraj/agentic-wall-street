-- ─────────────────────────────────────────────────────────────────────────────
-- Post-migration role grants and privilege revocations
-- Run as admin after every migration via scripts/apply-roles.ts
-- ─────────────────────────────────────────────────────────────────────────────

-- Ensure op schema exists
CREATE SCHEMA IF NOT EXISTS op;

-- Grant usage on schemas
GRANT USAGE ON SCHEMA ledger TO app;
GRANT USAGE ON SCHEMA op TO app;

-- ─── Ledger schema: SELECT + INSERT only. Never UPDATE, never DELETE. ─────────
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA ledger TO app;
REVOKE UPDATE, DELETE ON ALL TABLES IN SCHEMA ledger FROM app;
REVOKE UPDATE, DELETE ON ALL TABLES IN SCHEMA ledger FROM PUBLIC;

-- Apply to future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA ledger GRANT SELECT, INSERT ON TABLES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ledger REVOKE UPDATE, DELETE ON TABLES FROM PUBLIC;

-- ─── Op schema: full DML (nonces, auth tokens, operator_auth) ────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA op TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA op GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app;

-- Sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ledger TO app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA op TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA ledger GRANT USAGE, SELECT ON SEQUENCES TO app;
ALTER DEFAULT PRIVILEGES IN SCHEMA op GRANT USAGE, SELECT ON SEQUENCES TO app;
