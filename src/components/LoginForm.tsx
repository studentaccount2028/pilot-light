// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { useState } from "react";

// Email in, link out. In simulated mode (no email service configured) the
// link is shown here so the demo can be signed into without an inbox.
export function LoginForm({ next, reason }: { next?: string; reason?: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: boolean; link?: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, next }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not send the link.");
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the link.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-4">
        <h1 className="title-xl">{result.sent ? "Check your email" : "Your sign-in link"}</h1>
        {result.sent ? (
          <p className="text-[15px] leading-snug text-ink-2">We sent a sign-in link to {email}. It works once and expires in 15 minutes.</p>
        ) : result.link ? (
          <>
            <p className="text-[15px] leading-snug text-ink-2">No email service is set up on this server, so here is the link directly. In production it would be emailed to {email}.</p>
            <a href={result.link} className="btn btn-primary h-12 w-full">
              Open the sign-in link
            </a>
          </>
        ) : (
          <p className="text-[15px] leading-snug text-danger">No email service is set up on this server, so the link could not be sent. Ask whoever runs it to set RESEND_API_KEY.</p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h1 className="title-xl">Sign in</h1>
      <p className="text-[15px] leading-snug text-muted">{reason ?? "Enter your email and we will send you a link. No password."}</p>
      <label className="block">
        <span className="label">Email</span>
        <input className="field" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoFocus />
      </label>
      {error && (
        <p className="rounded-xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      <button className="btn btn-primary h-12 w-full" disabled={busy || !email.includes("@")}>
        {busy ? "Sending…" : "Send sign-in link"}
      </button>
    </form>
  );
}
