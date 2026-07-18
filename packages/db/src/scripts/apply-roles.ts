import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function applyRoles() {
  const adminUrl =
    process.env["DATABASE_ADMIN_URL"] ?? process.env["DATABASE_URL"];
  if (!adminUrl) throw new Error("DATABASE_ADMIN_URL is required");

  const pool = new Pool({ connectionString: adminUrl });
  const client = await pool.connect();

  try {
    const rolesSql = readFileSync(
      path.join(__dirname, "../sql/apply-roles.sql"),
      "utf-8"
    );
    const triggersSql = readFileSync(
      path.join(__dirname, "../sql/append-only-triggers.sql"),
      "utf-8"
    );

    await client.query("BEGIN");
    await client.query(rolesSql);
    await client.query(triggersSql);
    await client.query("COMMIT");

    console.log("✓ Roles and append-only triggers applied");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

applyRoles().catch((err) => {
  console.error(err);
  process.exit(1);
});
