// AI-assisted: written with Claude Code from the team's build spec and security plan.
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TopBar } from "./TopBar";

// Staff pages (EMS board, town roster, storm replay) when nobody with access is signed in.
// EMS and coordinators sign in with their email (their role is granted by an administrator);
// the administrator enters the access key here, never in the address bar.
export function Locked({ what, next, need = "signin", email }: { what: string; next: string; need?: "signin" | "enroll" | "verify" | null; email?: string }) {
  if (need === "enroll" || need === "verify") return <SecondFactor what={what} enroll={need === "enroll"} email={email} />;
  return <SignIn what={what} next={next} />;
}

// Staff with an account: set up an authenticator app (first time) or enter today's code.
function SecondFactor({ what, enroll, email }: { what: string; enroll: boolean; email?: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enroll) return;
    fetch("/api/staff/mfa")
      .then((r) => r.json())
      .then((j) => j.qr && setSetup({ qr: j.qr, secret: j.secret }))
      .catch(() => setError("Could not start setup. Reload the page."));
  }, [enroll]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "That didn't work.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <TopBar />
      <div className="mx-auto max-w-[440px] space-y-6 px-5 pt-10">
        <div>
          <h1 className="font-display text-[30px] font-semibold tracking-tight">{enroll ? "Set up your authenticator" : "Enter your code"}</h1>
          <p className="mt-2 text-ink-2">
            {enroll
              ? `${what} shows entry codes and medical details, so staff accounts use a second step. Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code it shows.`
              : `Open your authenticator app and enter the 6-digit code for Pilot Light${email ? ` (${email})` : ""}. You'll be asked again in 12 hours.`}
          </p>
        </div>
        {enroll && setup && (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-surface-2 p-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qr} alt="QR code for your authenticator app" width={200} height={200} className="rounded-lg" />
            <p className="text-center text-[13px] text-muted">
              Can&apos;t scan? Enter this key: <code className="select-all break-all font-mono">{setup.secret}</code>
            </p>
          </div>
        )}
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-[14px] font-medium text-muted" htmlFor="mfa-code">
            6-digit code
          </label>
          <input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input h-12 w-full text-center font-mono text-[22px] tracking-[0.3em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          {error && <p className="text-[14px] text-danger">{error}</p>}
          <button className="btn btn-primary h-12 w-full" disabled={busy || code.length !== 6}>
            {busy ? "Checking…" : enroll ? "Finish setup" : "Continue"}
          </button>
        </form>
      </div>
    </>
  );
}

function SignIn({ what, next }: { what: string; next: string }) {
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
