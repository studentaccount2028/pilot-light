// AI-assisted: written with Claude Code from the team's build spec.
import { NextResponse, type NextRequest } from "next/server";
import { userFromRequest } from "@/lib/auth";
import { saveHousehold } from "@/lib/households";
import { bad, handle } from "@/lib/http";

export const POST = handle(async (req: NextRequest) => {
  // A new household belongs to whoever is signed in.
  const user = await userFromRequest(req);
  if (!user) return bad("Sign in to set up a household.", 401);
  const id = await saveHousehold(await req.json(), undefined, user.id);
  return NextResponse.json({ id }, { status: 201 });
});
