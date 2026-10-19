// AI-assisted: written with Claude Code from the team's build spec.
import type { Metadata } from "next";
import { EmsBoard } from "@/components/EmsBoard";
import { Locked } from "@/components/Locked";
import { canSeeEms, staffAccess } from "@/lib/staff";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "EMS · Pilot Light", robots: { index: false, follow: false } };

export default async function Page() {
  const { staff, need, email } = await staffAccess();
  if (!canSeeEms(staff)) return <Locked what="The EMS board" next="/ems" need={staff ? "signin" : need} email={email} />;
  return <EmsBoard />;
}
