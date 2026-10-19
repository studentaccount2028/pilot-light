// AI-assisted: written with Claude Code from the team's build spec and security plan.
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TopBar } from "./TopBar";

// Staff pages (EMS board, town roster, storm replay) when nobody with access is signed in.
// EMS and coordinators sign in with their email (their role is granted by an administrator);
// the administrator enters the access key here, never in the address bar.
export function Locked({ what, next }: { what: string; next: string }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: key }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "That didn't work.");
      setKey("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <TopBar />
      <div className="mx-auto max-w-[440px] space-y-6 px-5 pt-10">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight">{what} is for staff</h1>
          <p className="mt-2 text-ink-2">EMS crews and town coordinators sign in with the email their department registered. Access is granted by the Pilot Light administrator.</p>
        </div>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn btn-primary h-12 w-full text-[17px]">
          Sign in with email
        </Link>
        <form onSubmit={submit} className="space-y-3 border-t border-line pt-6">
          <label className="block text-[14px] font-medium text-muted" htmlFor="admin-key">
            Administrator access key
          </label>
          <input id="admin-key" type="password" autoComplete="current-password" className="input h-12 w-full" value={key} onChange={(e) => setKey(e.target.value)} />
          {error && <p className="text-[14px] text-danger">{error}</p>}
          <button className="btn h-12 w-full" disabled={busy || !key}>
            {busy ? "Checking…" : "Sign in as administrator"}
          </button>
        </form>
      </div>
    </>
  );
}
