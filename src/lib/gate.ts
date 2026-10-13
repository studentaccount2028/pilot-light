// AI-assisted: written with Claude Code from the team's build spec.
// Page-level access check for a household, from the request cookies.
import { cookies } from "next/headers";
import { canAccess, userFromCookies } from "./auth";
import { ADMIN_COOKIE, tokenMatches } from "./admin";
import { getHousehold } from "./households";

export type GateState = "ok" | "missing" | "signin" | "forbidden";

export async function accessFromCookies(householdId: string): Promise<GateState> {
  const data = await getHousehold(householdId);
  if (!data) return "missing";
  const user = await userFromCookies();
  const admin = tokenMatches((await cookies()).get(ADMIN_COOKIE)?.value) && Boolean(process.env.ADMIN_TOKEN);
  if (canAccess(data.household, user, admin)) return "ok";
  return user ? "forbidden" : "signin";
}
