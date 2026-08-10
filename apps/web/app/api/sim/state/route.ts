import { NextResponse } from "next/server";
import { loadState } from "../../../../lib/sim/store";
import { buildView } from "../../../../lib/sim/view";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await loadState();
  return NextResponse.json(buildView(state));
}
