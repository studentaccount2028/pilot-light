// AI-assisted: written with Claude Code from the team's build spec.
import { HouseholdForm } from "@/components/HouseholdForm";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <HouseholdForm id={(await params).id} />;
}
