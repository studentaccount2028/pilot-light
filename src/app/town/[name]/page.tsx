// AI-assisted: written with Claude Code from the team's build spec.
import { Locked } from "@/components/Locked";
import { Roster } from "@/components/Roster";
import { canSeeTown, staffAccess } from "@/lib/staff";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const town = decodeURIComponent((await params).name);
  const { staff, need, email } = await staffAccess();
  if (!canSeeTown(staff, town)) return <Locked what="The town roster" next={`/town/${encodeURIComponent(town)}`} need={staff ? "signin" : need} email={email} />;
  return <Roster town={town} />;
}
