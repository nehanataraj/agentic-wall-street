import { runTick } from "./engine";

const TICK_INTERVAL_MS = 45_000;

declare global {
  // eslint-disable-next-line no-var
  var __simRunnerStarted: boolean | undefined;
}

/**
 * Starts the autonomous trading loop once per server process. Guarded by a
 * global flag so Next.js dev-mode module reloads / multiple instrumentation
 * registrations never spawn duplicate intervals.
 */
export function startSimRunner(): void {
  if (globalThis.__simRunnerStarted) return;
  globalThis.__simRunnerStarted = true;

  const tick = () => {
    runTick().catch((err) => {
      console.error(JSON.stringify({ level: "error", msg: "sim_tick_error", err: String(err) }));
    });
  };

  console.log(JSON.stringify({ level: "info", msg: "sim_runner_started", intervalMs: TICK_INTERVAL_MS }));
  tick();
  setInterval(tick, TICK_INTERVAL_MS);
}
