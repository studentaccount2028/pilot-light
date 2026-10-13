// AI-assisted: written with Claude Code from the team's build spec.
import { StatusScreen } from "@/components/StatusScreen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <StatusScreen id={(await params).id} />;
}
