// AI-assisted: written with Claude Code from the team's build spec.
// The EMS board. Admin token for now; a separate EMS login is the next step.
import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { emsBoard } from "@/lib/ems";
import { bad, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  if (!isAdmin(req)) return bad("Not authorized.", 401);
  return NextResponse.json(await emsBoard(), { headers: { "Cache-Control": "no-store" } });
});
