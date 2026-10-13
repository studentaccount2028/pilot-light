// AI-assisted: written with Claude Code from the team's build spec.
import { Gate } from "@/components/Gate";
import { HouseholdForm } from "@/components/HouseholdForm";
import { accessFromCookies } from "@/lib/gate";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await accessFromCookies(id);
  if (access !== "ok") return <Gate state={access} next={`/h/${id}/edit`} />;
  return <HouseholdForm id={id} />;
}
