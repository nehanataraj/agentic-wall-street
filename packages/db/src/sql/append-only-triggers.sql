-- ─────────────────────────────────────────────────────────────────────────────
-- Mutation-rejection triggers — defense in depth beyond role grants
-- These fire even if someone mistakenly grants UPDATE/DELETE to the app role
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ledger.reject_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Ledger is append-only: % on % is forbidden', TG_OP, TG_TABLE_NAME;
END;
$$;

-- Apply to every table in the ledger schema
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'ledger'
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS no_update ON ledger.%I;
       CREATE TRIGGER no_update BEFORE UPDATE ON ledger.%I
         FOR EACH ROW EXECUTE FUNCTION ledger.reject_mutation();
       DROP TRIGGER IF EXISTS no_delete ON ledger.%I;
       CREATE TRIGGER no_delete BEFORE DELETE ON ledger.%I
         FOR EACH ROW EXECUTE FUNCTION ledger.reject_mutation();',
      t, t, t, t
    );
  END LOOP;
END;
$$;
