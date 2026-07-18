import { createAppDb } from "@app/db";
import { ResolutionWorker } from "./resolution.js";
import { MerkleWorker } from "./merkle.js";

const env = {
  DATABASE_URL: process.env["DATABASE_URL"]!,
  SERVER_SIGNING_SEED: process.env["SERVER_SIGNING_SEED"]!,
  TWELVE_DATA_API_KEY: process.env["TWELVE_DATA_API_KEY"],
  EIA_API_KEY: process.env["EIA_API_KEY"],
  ALPHA_VANTAGE_API_KEY: process.env["ALPHA_VANTAGE_API_KEY"],
  MERKLE_S3_ENDPOINT: process.env["MERKLE_S3_ENDPOINT"],
  MERKLE_S3_BUCKET: process.env["MERKLE_S3_BUCKET"],
  MERKLE_S3_REGION: process.env["MERKLE_S3_REGION"],
  MERKLE_S3_ACCESS_KEY: process.env["MERKLE_S3_ACCESS_KEY"],
  MERKLE_S3_SECRET_KEY: process.env["MERKLE_S3_SECRET_KEY"],
};

if (!env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (!env.SERVER_SIGNING_SEED) throw new Error("SERVER_SIGNING_SEED required");

const db = createAppDb(env.DATABASE_URL);
const resolutionWorker = new ResolutionWorker(db, env);
const merkleWorker = new MerkleWorker(db, env);

const RESOLUTION_INTERVAL_MS = 5 * 60 * 1000;  // every 5 min
const MERKLE_INTERVAL_MS = 60 * 60 * 1000;     // every hour (publishes once per day)

async function loop() {
  console.log(JSON.stringify({ level: "info", msg: "worker_started" }));

  // Initial run
  await resolutionWorker.runOnce().catch((err) =>
    console.error(JSON.stringify({ level: "error", msg: "resolution_error", err: String(err) }))
  );
  await merkleWorker.publishDailyRoot().catch((err) =>
    console.error(JSON.stringify({ level: "error", msg: "merkle_error", err: String(err) }))
  );

  // Scheduled runs
  setInterval(async () => {
    await resolutionWorker.runOnce().catch((err) =>
      console.error(JSON.stringify({ level: "error", msg: "resolution_error", err: String(err) }))
    );
  }, RESOLUTION_INTERVAL_MS);

  setInterval(async () => {
    await merkleWorker.publishDailyRoot().catch((err) =>
      console.error(JSON.stringify({ level: "error", msg: "merkle_error", err: String(err) }))
    );
  }, MERKLE_INTERVAL_MS);
}

loop();
