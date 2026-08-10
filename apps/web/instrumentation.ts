// Next.js server-startup hook. Boots the 5-agent synthetic trading sim as
// soon as the web server process comes up (dev or prod) so agents start
// trading without any manual step. See lib/sim/README.md for details.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSimRunner } = await import("./lib/sim/runner");
  startSimRunner();
}
