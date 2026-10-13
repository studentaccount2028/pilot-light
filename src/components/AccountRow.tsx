// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconChevron, IconUser } from "./icons";

// Who is signed in, on the House tab, with a way out.
export function AccountRow() {
  const [user, setUser] = useState<{ email: string } | null | undefined>(undefined);
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setUser(j.user ?? null))
      .catch(() => setUser(null));
  }, []);
  if (user === undefined) return null;

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }

  return (
    <li>
      {user ? (
        <div className="row">
          <span className="tile">
            <IconUser className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium leading-snug">{user.email}</span>
            <span className="block text-[13px] text-muted">Signed in</span>
          </span>
          <button className="btn btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      ) : (
        <Link href="/login" className="row">
          <span className="tile">
            <IconUser className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium leading-snug">Sign in</span>
            <span className="block text-[13px] text-muted">Keep this household to your account</span>
          </span>
          <IconChevron className="h-4 w-4 shrink-0 text-muted" />
        </Link>
      )}
    </li>
  );
}
