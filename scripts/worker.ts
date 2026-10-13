// AI-assisted: written with Claude Code from the team's build spec.
// The background worker: polls NWS every 60 s and evaluates every household's
// state machine every few seconds. Ticking more often than the spec's one
// minute is harmless (every action is idempotent) and keeps a sped-up replay smooth.
import "./_env";
import { tick } from "../src/lib/engine/tick";
import { pollNws } from "../src/lib/nws";
import { transportMode } from "../src/lib/twilio";

const TICK_MS = Number(process.env.TICK_INTERVAL_MS) || 5_000;
const POLL_MS = 60_000;

console.log(`Pilot Light worker: tick every ${TICK_MS / 1000}s, NWS poll every 60s, transport = ${transportMode()}`);

async function poll() {
  try {
    const r = await pollNws();
    if (r.status !== 304) console.log(`NWS poll: ${r.kept} qualifying warning(s) of ${r.total} active NH alert(s)`);
  } catch (err) {
    console.error("NWS poll failed (will retry):", err instanceof Error ? err.message : err);
  }
}

let ticking = false;
async function runTick() {
  if (ticking) return; // never overlap with ourselves
  ticking = true;
  try {
    await tick();
  } catch (err) {
    console.error("Tick failed (will retry):", err instanceof Error ? err.message : err);
  } finally {
    ticking = false;
  }
}

await poll();
await runTick();
setInterval(poll, POLL_MS);
setInterval(runTick, TICK_MS);
