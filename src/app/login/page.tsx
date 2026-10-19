// AI-assisted: written with Claude Code from the team's build spec.
import { safeNextPath } from "@/lib/security/paths";
import Link from "next/link";
import { LoginForm } from "@/components/LoginForm";
import { PhoneStage } from "@/components/Phone";
import { TopBar } from "@/components/TopBar";
import { userFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const user = await userFromCookies();
  return (
    <PhoneStage>
      <TopBar />
      <main className="mx-auto max-w-[440px] px-5 pb-12 pt-8">
        {user ? (
          <div className="space-y-4">
            <h1 className="title-xl">Signed in</h1>
            <p className="text-[15px] text-ink-2">You are signed in as {user.email}.</p>
            <Link href={safeNextPath(next) ?? "/"} className="btn btn-primary h-12 w-full">
              Continue
            </Link>
          </div>
        ) : (
          <LoginForm next={next} reason={error === "expired" ? "That link has expired or was already used. Enter your email for a new one." : undefined} />
        )}
      </main>
    </PhoneStage>
  );
}
