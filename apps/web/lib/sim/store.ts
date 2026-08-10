import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentState, SimAgentDef, SimState } from "./types";
import { STARTING_CASH } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_PATH = path.join(DATA_DIR, "sim-state.json");

export const AGENT_ROSTER: SimAgentDef[] = [
  {
    id: "sim_momentum",
    name: "Momentum Max",
    strategy: "momentum",
    tagline: "Rides short-term trend strength across BTC, ETH, SOL, XRP.",
  },
  {
    id: "sim_meanrev",
    name: "Mean Reversion Mia",
    strategy: "mean-reversion",
    tagline: "Buys dips below the 10-tick average, sells into pops.",
  },
  {
    id: "sim_rsi",
    name: "RSI Ranger",
    strategy: "rsi",
    tagline: "Classic oversold/overbought RSI(10) swing trading.",
  },
  {
    id: "sim_breakout",
    name: "Breakout Bolt",
    strategy: "breakout",
    tagline: "Enters Bollinger-band breakouts, exits on mean-fade.",
  },
  {
    id: "sim_steady",
    name: "Steady Compounder",
    strategy: "steady-compounder",
    tagline: "Control strategy: equal-weight basket, scheduled rebalance only.",
  },
];

function freshAgentState(def: SimAgentDef, now: string): AgentState {
  return {
    id: def.id,
    name: def.name,
    strategy: def.strategy,
    tagline: def.tagline,
    cash: STARTING_CASH,
    holdings: {},
    equityHistory: [{ t: now, equity: STARTING_CASH }],
    createdAt: now,
  };
}

export function freshState(): SimState {
  const now = new Date().toISOString();
  const agents: Record<string, AgentState> = {};
  for (const def of AGENT_ROSTER) {
    agents[def.id] = freshAgentState(def, now);
  }
  return {
    version: 2,
    startingCash: STARTING_CASH,
    agents,
    trades: [],
    priceHistory: {},
    tickCount: 0,
    lastTickAt: null,
    lastError: null,
  };
}

let cache: SimState | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export async function loadState(): Promise<SimState> {
  if (cache) return cache;
  try {
    const raw = await readFile(STATE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SimState;
    if (parsed.version !== 2) throw new Error("stale sim state version");
    // Heal roster drift (e.g. new agent added after first launch).
    for (const def of AGENT_ROSTER) {
      if (!parsed.agents[def.id]) {
        parsed.agents[def.id] = freshAgentState(def, new Date().toISOString());
      }
    }
    cache = parsed;
    return parsed;
  } catch {
    const seeded = freshState();
    cache = seeded;
    await saveState(seeded);
    return seeded;
  }
}

export async function saveState(state: SimState): Promise<void> {
  cache = state;
  // Serialize writes so overlapping ticks never interleave file writes.
  writeQueue = writeQueue.then(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const tmpPath = `${STATE_PATH}.${process.pid}.tmp`;
    await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
    await rename(tmpPath, STATE_PATH);
  });
  await writeQueue;
}
