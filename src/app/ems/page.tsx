// AI-assisted: written with Claude Code from the team's build spec.
import type { Metadata } from "next";
import { EmsBoard } from "@/components/EmsBoard";
import { Locked } from "@/components/Locked";
import { canSeeEms, staffFromCookies } from "@/lib/staff";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "EMS · Pilot Light", robots: { index: false, follow: false } };

export default async function Page() {
  if (!canSeeEms(await staffFromCookies())) return <Locked what="The EMS board" next="/ems" />;
  return <EmsBoard />;
}
