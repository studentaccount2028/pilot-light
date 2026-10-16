// AI-assisted: written with Claude Code from the team's build spec.
import Link from "next/link";
import { LogoMark } from "./icons";

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="Pilot Light home">
      <LogoMark className="h-[22px] w-auto" />
      <span className="font-[family-name:var(--font-brand)] text-[22px] font-medium leading-none tracking-[-0.01em]">pilot light</span>
    </Link>
  );
}

export function TopBar({ wide = false }: { wide?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg print:hidden">
      <div className={`mx-auto flex h-14 items-center justify-between gap-3 px-5 ${wide ? "max-w-6xl" : "max-w-[440px]"}`}>
        <Wordmark />
      </div>
    </header>
  );
}
