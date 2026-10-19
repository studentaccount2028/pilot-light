// AI-assisted: written with Claude Code from the team's build spec.
// Where a power module reports. POST JSON with "Authorization: Bearer <token>",
// or a plain GET with the token and short field names in the query string for
// modems that can only fetch a URL:
//   GET /api/sensor/report?t=<token>&m=1&v=121&c=1&b=87&wh=256&h=94&w=45&rssi=-91
import { limited } from "@/lib/security/rateLimit";
import { NextResponse, type NextRequest } from "next/server";
import { bad, handle } from "@/lib/http";
import { parseReading, recordReading, sensorForToken } from "@/lib/sensors";

export const dynamic = "force-dynamic";

async function report(req: NextRequest, body: Record<string, unknown>) {
  const slow = limited(req, "sensorReport");
  if (slow) return slow;
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : String(body.t ?? body.token ?? "");
  if (!token) return bad("Missing token.", 401);
  const sensor = await sensorForToken(token);
  if (!sensor) return bad("Unknown token.", 401);
  const fields = parseReading(body);
  if (Object.values(fields).every((v) => v == null)) return bad("No readings in the report.", 422);
  const { at } = await recordReading(sensor.id, fields);
  // A short reply keeps a modem's response buffer small.
  return NextResponse.json({ ok: true, at: at.toISOString() });
}

export const POST = handle(async (req: NextRequest) => {
  const type = req.headers.get("content-type") ?? "";
  const body = type.includes("application/json")
    ? ((await req.json()) as Record<string, unknown>)
    : Object.fromEntries(new URLSearchParams(await req.text()));
  return report(req, { ...Object.fromEntries(req.nextUrl.searchParams), ...body });
});

export const GET = handle(async (req: NextRequest) => report(req, Object.fromEntries(req.nextUrl.searchParams)));
