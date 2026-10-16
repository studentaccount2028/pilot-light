// AI-assisted: written with Claude Code from the team's build spec.
// The road from each contact to the house, for the map.
import { NextResponse, type NextRequest } from "next/server";
import { getHousehold } from "@/lib/households";
import { accessFromRequest } from "@/lib/auth";
import { bad, handle } from "@/lib/http";
import { drivingRoute } from "@/lib/routes";

export const GET = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const data = await getHousehold((await params).id);
  if (!data) return bad("Household not found.", 404);
  if (!(await accessFromRequest(req, data.household))) return bad("Sign in as the person who set this household up.", 403);
  const home = { lat: data.household.lat, lng: data.household.lng };
  const placed = data.contacts.filter((c) => c.lat != null && c.lng != null);
  const routes = await Promise.all(placed.map(async (c) => ({ contactId: c.id, ...(await drivingRoute({ lat: c.lat!, lng: c.lng! }, home)) })));
  return NextResponse.json({ routes });
});
