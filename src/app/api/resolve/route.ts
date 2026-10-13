// AI-assisted: written with Claude Code from the team's build spec.
// Address -> lat/lng, town, NWS zone and suggested utility, for the setup form.
import { NextResponse, type NextRequest } from "next/server";
import { bad, handle } from "@/lib/http";
import { locateInNH, resolveZone } from "@/lib/nws";
import { utilityForTown } from "@/lib/utilities";

export const GET = handle(async (req: NextRequest) => {
  const address = req.nextUrl.searchParams.get("address")?.trim();
  if (!address || address.length < 5) return bad("Enter a street address and town.");
  const town = req.nextUrl.searchParams.get("town")?.trim() ?? "";
  const hit = await locateInNH(address, town);
  if (hit === "outside") return bad("That address came back outside New Hampshire. Pilot Light only covers NH. Add the town and NH to the address.", 422);
  if (!hit) return bad("We could not find that address in New Hampshire. Check the street and the town's spelling.", 404);
  let zone;
  try {
    zone = await resolveZone(hit.lat, hit.lng);
  } catch (err) {
    console.error("Zone lookup failed:", err);
    return bad("The National Weather Service could not match that address to a forecast zone. Try again in a minute.", 502);
  }
  return NextResponse.json({ ...hit, state: "NH", ...zone, suggestedUtility: utilityForTown(hit.town) });
});
