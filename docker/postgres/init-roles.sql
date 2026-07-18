-- ──────────────────────────────────────────────────────────────────────────────
-- PostgreSQL role bootstrap – run once by the admin connection at cluster init
-- The application role has SELECT + INSERT on the ledger schema only.
-- UPDATE and DELETE are explicitly revoked and never granted.
-- ──────────────────────────────────────────────────────────────────────────────

-- Create application role
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app') THEN
    CREATE ROLE app LOGIN PASSWORD 'apppassword';
  END IF;
END
$$;

-- Connect privileges
GRANT CONNECT ON DATABASE predictions TO app;

-- Schema create (admin creates the ledger schema and grants usage)
-- Ledger schema is created in migrations; grant usage after migration
-- This file ensures the role exists for migrations to reference.
