// AI-assisted: written with Claude Code from the team's build spec.
import { Locked } from "@/components/Locked";
import { ReplayConsole } from "@/components/ReplayConsole";
import { canRunReplay, staffFromCookies } from "@/lib/staff";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (!canRunReplay(await staffFromCookies())) return <Locked what="Storm replay" next="/replay" />;
  return <ReplayConsole />;
}
