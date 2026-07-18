import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";

/**
 * Acceptance test: verifies that the application role cannot UPDATE or DELETE
 * any row in the ledger schema, regardless of application code bugs.
 */
describe("DB ledger append-only privileges", () => {
  let adminPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    const adminUrl = process.env["DATABASE_ADMIN_URL"];
    const appUrl = process.env["DATABASE_URL"];
    if (!adminUrl || !appUrl) throw new Error("DB URLs required");

    adminPool = new Pool({ connectionString: adminUrl });
    appPool = new Pool({ connectionString: appUrl });

    // Run migrations + role setup
    const { execSync } = await import("node:child_process");
    execSync("pnpm migrate && pnpm roles", {
      cwd: new URL("../..", import.meta.url).pathname,
      env: process.env,
      stdio: "inherit",
    });
  });

  afterAll(async () => {
    await adminPool.end();
    await appPool.end();
  });

  const ledgerTables = [
    "operators",
    "agents",
    "agent_events",
    "configs",
    "claims",
    "claim_events",
    "resolutions",
    "sealed_reveals",
    "merkle_roots",
  ] as const;

  for (const table of ledgerTables) {
    test(`app role cannot UPDATE ledger.${table}`, async () => {
      const client = await appPool.connect();
      try {
        await expect(
          client.query(`UPDATE ledger.${table} SET id = id WHERE false`)
        ).rejects.toThrow();
      } finally {
        client.release();
      }
    });

    test(`app role cannot DELETE from ledger.${table}`, async () => {
      const client = await appPool.connect();
      try {
        await expect(
          client.query(`DELETE FROM ledger.${table} WHERE false`)
        ).rejects.toThrow();
      } finally {
        client.release();
      }
    });
  }

  test("trigger fires and blocks UPDATE even as admin", async () => {
    // Insert a test operator as admin
    const adminClient = await adminPool.connect();
    try {
      const result = await adminClient.query<{ id: string }>(
        `INSERT INTO ledger.operators (email) VALUES ('test@example.com') RETURNING id`
      );
      const id = result.rows[0]!.id;

      await expect(
        adminClient.query(
          `UPDATE ledger.operators SET email = 'changed@example.com' WHERE id = $1`,
          [id]
        )
      ).rejects.toThrow(/append-only/);

      // Cleanup: delete via admin to not pollute, but trigger blocks it too
      // So just verify the trigger fired; clean up test data differently
    } finally {
      adminClient.release();
    }
  });
});
