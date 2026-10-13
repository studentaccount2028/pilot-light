// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { getHousehold, isUuid, saveHousehold } from "@/lib/households";
import { bad, handle } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: NextRequest, { params }: Ctx) => {
  const data = await getHousehold((await params).id);
  return data ? NextResponse.json(data) : bad("Household not found.", 404);
});

export const PUT = handle(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  if (!isUuid(id)) return bad("Household not found.", 404);
  await saveHousehold(await req.json(), id);
  return NextResponse.json({ id });
});
