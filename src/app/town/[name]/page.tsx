// AI-assisted: written with Claude Code from the team's build spec.
import { Locked } from "@/components/Locked";
import { Roster } from "@/components/Roster";
import { canSeeTown, staffFromCookies } from "@/lib/staff";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const town = decodeURIComponent((await params).name);
  if (!canSeeTown(await staffFromCookies(), town)) return <Locked what="The town roster" next={`/town/${encodeURIComponent(town)}`} />;
  return <Roster town={town} />;
}
