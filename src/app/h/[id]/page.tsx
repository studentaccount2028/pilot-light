// AI-assisted: written with Claude Code from the team's build spec.
import { Gate } from "@/components/Gate";
import { ExitFullScreen, StatusScreen } from "@/components/StatusScreen";
import { accessFromCookies } from "@/lib/gate";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;
  const access = await accessFromCookies(id);
  if (access !== "ok") return <Gate state={access} next={`/h/${id}`} />;
  // Opened from the storm replay: offer the way back.
  const exitHref = from === "replay" ? "/replay" : undefined;
  return (
    <>
      {exitHref && <ExitFullScreen href={exitHref} />}
      <StatusScreen id={id} />
    </>
  );
}
