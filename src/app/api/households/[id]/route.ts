// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { getHousehold, isUuid, saveHousehold } from "@/lib/households";
import { accessFromRequest } from "@/lib/auth";
import { bad, handle } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: NextRequest, { params }: Ctx) => {
  const data = await getHousehold((await params).id);
  if (!data) return bad("Household not found.", 404);
  if (!(await accessFromRequest(req, data.household))) return bad("Sign in as the person who set this household up.", 403);
  return NextResponse.json(data);
});

export const PUT = handle(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!isUuid(id)) return bad("Household not found.", 404);
  const existing = await getHousehold(id);
  if (!existing) return bad("Household not found.", 404);
  if (!(await accessFromRequest(req, existing.household))) return bad("Sign in as the person who set this household up.", 403);
  await saveHousehold(await req.json(), id);
  return NextResponse.json({ id });
});
