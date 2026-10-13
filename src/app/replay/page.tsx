// AI-assisted: written with Claude Code from the team's build spec.
import { Locked } from "@/components/Locked";
import { ReplayConsole } from "@/components/ReplayConsole";
import { tokenMatches } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const { key } = await searchParams;
  if (!tokenMatches(key)) return <Locked what="Storm replay" />;
  return <ReplayConsole adminKey={key ?? ""} />;
}
