// AI-assisted: written with Claude Code from the team's security plan.
// One-time: encrypt entry notes saved before field encryption was turned on.
// Run after setting FIELD_ENCRYPTION_KEY:  npx tsx scripts/encrypt-existing.ts
import "dotenv/config";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../src/db/client";
import { households } from "../src/db/schema";
import { isSealed, seal } from "../src/lib/security/fieldCrypto";

async function main() {
  if (!process.env.FIELD_ENCRYPTION_KEY) throw new Error("Set FIELD_ENCRYPTION_KEY first.");
  const rows = await db.select({ id: households.id, accessNotes: households.accessNotes }).from(households).where(isNotNull(households.accessNotes));
  let n = 0;
  for (const r of rows) {
    if (isSealed(r.accessNotes)) continue;
    await db.update(households).set({ accessNotes: seal(r.accessNotes) }).where(eq(households.id, r.id));
    n++;
  }
  console.log(`Encrypted entry notes for ${n} of ${rows.length} households.`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
