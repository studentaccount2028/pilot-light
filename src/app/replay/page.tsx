// AI-assisted: written with Claude Code from the team's build spec.
import { Locked } from "@/components/Locked";
import { ReplayConsole } from "@/components/ReplayConsole";
import { canRunReplay, staffAccess } from "@/lib/staff";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { staff, need, email } = await staffAccess();
  if (!canRunReplay(staff)) return <Locked what="Storm replay" next="/replay" need={staff ? "signin" : need} email={email} />;
  return <ReplayConsole />;
}
