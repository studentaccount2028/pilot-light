// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { accessFromRequest } from "@/lib/auth";
import { getHousehold, isUuid } from "@/lib/households";
import { bad, handle } from "@/lib/http";
import { deleteSensor } from "@/lib/sensors";

export const DELETE = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string; sensorId: string }> }) => {
  const { id, sensorId } = await params;
  const data = await getHousehold(id);
  if (!data || !isUuid(sensorId)) return bad("Not found.", 404);
  if (!(await accessFromRequest(req, data.household))) return bad("Sign in as the person who set this household up.", 403);
  return (await deleteSensor(id, sensorId)) ? NextResponse.json({ ok: true }) : bad("Not found.", 404);
});
