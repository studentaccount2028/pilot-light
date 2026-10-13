// AI-assisted: written with Claude Code from the team's build spec.
import Link from "next/link";
import type { GateState } from "@/lib/gate";
import { LoginForm } from "./LoginForm";
import { PhoneStage } from "./Phone";
import { TopBar } from "./TopBar";

// What a visitor sees instead of a household they cannot open.
export function Gate({ state, next, reason }: { state: Exclude<GateState, "ok">; next: string; reason?: string }) {
  return (
    <PhoneStage>
      <TopBar />
      <main className="mx-auto max-w-[440px] px-5 pb-12 pt-8">
        {state === "signin" ? (
          <LoginForm next={next} reason={reason ?? "This household belongs to an account. Sign in with the email that set it up."} />
        ) : state === "forbidden" ? (
          <div className="space-y-4">
            <h1 className="title-xl">Not your household</h1>
            <p className="text-[15px] leading-snug text-ink-2">This household was set up by a different account. Sign in with the email that set it up, or ask them to share the status with you.</p>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn w-full">
              Sign in with a different email
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="title-xl">We could not find that household</h1>
            <p className="text-[15px] leading-snug text-ink-2">Check the link, or set the household up again.</p>
            <Link href="/h/new" className="btn btn-primary h-12 w-full">
              Set up a household
            </Link>
          </div>
        )}
      </main>
    </PhoneStage>
  );
}
