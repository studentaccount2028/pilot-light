// AI-assisted: written with Claude Code from the team's build spec.
import { Gate } from "@/components/Gate";
import { StatusScreen } from "@/components/StatusScreen";
import { accessFromCookies } from "@/lib/gate";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await accessFromCookies(id);
  if (access !== "ok") return <Gate state={access} next={`/h/${id}`} />;
  return <StatusScreen id={id} />;
}
