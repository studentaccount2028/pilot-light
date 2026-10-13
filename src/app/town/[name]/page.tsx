// AI-assisted: written with Claude Code from the team's build spec.
import { Locked } from "@/components/Locked";
import { Roster } from "@/components/Roster";
import { tokenMatches } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ name: string }>; searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!tokenMatches(key)) return <Locked what="The town roster" />;
  return <Roster town={decodeURIComponent((await params).name)} adminKey={key ?? ""} />;
}
