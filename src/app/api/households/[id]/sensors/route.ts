// AI-assisted: written with Claude Code from the team's build spec.
// The household's power modules: list with latest status, or pair a new one.
import { NextResponse, type NextRequest } from "next/server";
import { accessFromRequest } from "@/lib/auth";
import { getHousehold } from "@/lib/households";
import { bad, handle } from "@/lib/http";
import { createSensor, latestReadings } from "@/lib/sensors";

type Ctx = { params: Promise<{ id: string }> };

async function gate(req: NextRequest, id: string) {
  const data = await getHousehold(id);
  if (!data) return bad("Household not found.", 404);
  if (!(await accessFromRequest(req, data.household))) return bad("Sign in as the person who set this household up.", 403);
  return null;
}

export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const denied = await gate(req, id);
  if (denied) return denied;
  return NextResponse.json({ sensors: await latestReadings(id) }, { headers: { "Cache-Control": "no-store" } });
});

export const POST = handle(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const denied = await gate(req, id);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  const { sensor, token } = await createSensor(id, typeof body.label === "string" ? body.label : "Power module");
  // The token is shown once, to be put into the module's firmware.
  return NextResponse.json({ id: sensor.id, label: sensor.label, token }, { status: 201 });
});
