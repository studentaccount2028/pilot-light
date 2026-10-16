// AI-assisted: written with Claude Code from the team's build spec.
import type { Metadata } from "next";
import { ResponderView } from "@/components/ResponderView";

export const dynamic = "force-dynamic";
// The link is a credential: keep it out of search results and referrers.
export const metadata: Metadata = { title: "Responder · Pilot Light", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  return <ResponderView linkKey={(await params).key} />;
}
