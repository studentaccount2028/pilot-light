// AI-assisted: written with Claude Code from the team's build spec.
import "./_env";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, db } from "../src/db/client";

await migrate(db, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
await closeDb();
