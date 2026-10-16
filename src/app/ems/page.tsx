// AI-assisted: written with Claude Code from the team's build spec.
import type { Metadata } from "next";
import { EmsBoard } from "@/components/EmsBoard";
import { Locked } from "@/components/Locked";
import { tokenMatches } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "EMS · Pilot Light", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!tokenMatches(key)) return <Locked what="The EMS board" />;
  return <EmsBoard adminKey={key ?? ""} />;
}
