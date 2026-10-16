// AI-assisted: written with Claude Code from the team's build spec.
// A short, memorable link to the seeded demo household (Mom's house in
// Ossipee). It has no owner, so it opens without signing in.
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/h/00000000-0000-4000-8000-000000000001");
}
