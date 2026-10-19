// AI-assisted: written with Claude Code from the team's build spec.
// The EMS board: EMS staff accounts and the administrator. Each view is audited (it carries entry notes).
import { NextResponse, type NextRequest } from "next/server";
import { auditOncePer } from "@/lib/security/audit";
import { actorOf, canSeeEms, staffFromRequest } from "@/lib/staff";
import { emsBoard } from "@/lib/ems";
import { bad, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest) => {
  const staff = await staffFromRequest(req);
  if (!canSeeEms(staff)) return bad("Not authorized.", 401);
  const board = await emsBoard();
  // One audit line per poll would flood the log; record the incidents whose entry notes were on screen.
  const ids = (board as { incidents?: { id: string }[] }).incidents?.map((i) => i.id) ?? [];
  if (ids.length) await auditOncePer(req, ids.join(","), { action: "ems.board_viewed", actor: actorOf(staff!), detail: `incidents: ${ids.join(",")}` });
  return NextResponse.json(board, { headers: { "Cache-Control": "no-store" } });
});
