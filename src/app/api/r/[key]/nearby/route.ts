// AI-assisted: written with Claude Code from the team's build spec.
// Closest hospital, fire/rescue and police to the house, for the responder page.
import { NextResponse, type NextRequest } from "next/server";
import { bad, handle } from "@/lib/http";
import { nearbySites } from "@/lib/nearby";
import { contactByKey } from "@/lib/responder";

export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ key: string }> }) => {
  const row = await contactByKey((await params).key);
  if (!row) return bad("This link is not valid any more.", 404);
  return NextResponse.json({ sites: await nearbySites({ lat: row.household.lat, lng: row.household.lng }) });
});
