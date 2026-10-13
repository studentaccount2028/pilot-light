// AI-assisted: written with Claude Code from the team's build spec.
// For hosts without a long-running worker (Vercel Cron): one poll and one tick per call.
import { NextResponse, type NextRequest } from "next/server";
import { tick } from "@/lib/engine/tick";
import { handle } from "@/lib/http";
import { pollNws } from "@/lib/nws";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const GET = handle(async (req: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  if (secret ? req.headers.get("authorization") !== `Bearer ${secret}` : process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const nws = await pollNws().catch((err) => ({ error: err instanceof Error ? err.message : String(err) }));
  const result = await tick();
  return NextResponse.json({ ok: true, nws, ...result });
});
