import { NextResponse } from "next/server";
import { runTick } from "../../../../lib/sim/engine";
import { buildView } from "../../../../lib/sim/view";

export const dynamic = "force-dynamic";

/** Manual trigger — lets the dashboard force a tick on demand for the demo. */
export async function POST() {
  const state = await runTick();
  return NextResponse.json(buildView(state));
}
