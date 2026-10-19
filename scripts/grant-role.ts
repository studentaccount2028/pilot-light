// AI-assisted: written with Claude Code from the team's security plan.
// Give a staff member access. Roles are never self-assigned; an administrator runs this.
//   npx tsx scripts/grant-role.ts medic@cityofpaloalto.org ems
//   npx tsx scripts/grant-role.ts coordinator@ossipee.org coordinator Ossipee
//   npx tsx scripts/grant-role.ts someone@example.com member      (removes staff access)
import "dotenv/config";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";
import { normalizeEmail } from "../src/lib/auth";

const ROLES = ["member", "ems", "coordinator", "admin"] as const;

async function main() {
  const [rawEmail, role, town] = process.argv.slice(2);
  const email = normalizeEmail(rawEmail);
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
