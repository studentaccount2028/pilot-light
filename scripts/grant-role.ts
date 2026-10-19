// AI-assisted: written with Claude Code from the team's security plan.
// Give a staff member access. Roles are never self-assigned; an administrator runs this.
//   npx tsx scripts/grant-role.ts medic@cityofpaloalto.org ems
//   npx tsx scripts/grant-role.ts coordinator@ossipee.org coordinator Ossipee
//   npx tsx scripts/grant-role.ts someone@example.com member      (removes staff access)
//   npx tsx scripts/grant-role.ts medic@cityofpaloalto.org --reset-2fa   (lost phone: set up the authenticator again)
import "./_env";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { sessions, users } from "../src/db/schema";
import { normalizeEmail } from "../src/lib/auth";

const ROLES = ["member", "ems", "coordinator", "admin"] as const;

async function main() {
  const [rawEmail, role, town] = process.argv.slice(2);
  const email = normalizeEmail(rawEmail);
  if (email && role === "--reset-2fa") {
    const [u] = await db.update(users).set({ totpSecret: null, totpPendingSecret: null, totpLastStep: null }).where(eq(users.email, email)).returning({ id: users.id });
    if (!u) throw new Error(`No account for ${email}.`);
    await db.delete(sessions).where(eq(sessions.userId, u.id)); // signed out everywhere
    console.log(`${email}: authenticator removed and signed out. They'll set up a new one at next sign-in.`);
    process.exit(0);
  }
  if (!email || !ROLES.includes(role as (typeof ROLES)[number])) throw new Error("Usage: grant-role.ts <email> <member|ems|coordinator|admin> [town]");
  if (role === "coordinator" && !town) throw new Error("A coordinator needs a town.");
  await db
    .insert(users)
    .values({ email, role: role as (typeof ROLES)[number], staffTown: role === "coordinator" ? town : null })
    .onConflictDoUpdate({ target: users.email, set: { role: role as (typeof ROLES)[number], staffTown: role === "coordinator" ? town : null } });
  console.log(`${email} is now ${role}${role === "coordinator" ? ` for ${town}` : ""}. They sign in at /login with this email.`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
