// AI-assisted: written with Claude Code from the team's build spec.
import { TopBar } from "./TopBar";

export function Locked({ what }: { what: string }) {
  return (
    <>
    <TopBar />
    <div className="mx-auto max-w-[440px] space-y-3 px-5 pt-10">
      <h1 className="font-display text-[30px] font-semibold tracking-tight">{what} is locked</h1>
      <p className="text-ink-2">
        Open this page with the access key at the end of the address, like <code className="rounded bg-surface-2 px-1.5 py-0.5">?key=…</code>. The key is the
        ADMIN_TOKEN set on the server.
      </p>
    </div>
    </>
  );
}
