// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { getStatus } from "@/lib/households";
import { bad, handle } from "@/lib/http";

export const dynamic = "force-dynamic";

export const GET = handle(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const data = await getStatus((await params).id);
  return data ? NextResponse.json(data, { headers: { "Cache-Control": "no-store" } }) : bad("Household not found.", 404);
});
