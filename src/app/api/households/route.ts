// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { saveHousehold } from "@/lib/households";
import { handle } from "@/lib/http";

export const POST = handle(async (req: NextRequest) => {
  const id = await saveHousehold(await req.json());
  return NextResponse.json({ id }, { status: 201 });
});
