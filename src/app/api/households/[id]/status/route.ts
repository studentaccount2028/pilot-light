// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { getStatus } from "@/lib/households";
import { accessFromRequest } from "@/lib/auth";
import { bad, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const data = await getStatus((await params).id);
  if (!data) return bad("Household not found.", 404);
  if (!(await accessFromRequest(req, data.household))) return bad("Sign in as the person who set this household up.", 403);
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
});
