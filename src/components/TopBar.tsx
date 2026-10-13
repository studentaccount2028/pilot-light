// AI-assisted: written with Claude Code from the team's build spec.
import Link from "next/link";
import { Flame } from "./icons";

export function Wordmark() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <Flame className="h-6 w-auto" />
      <span className="text-[20px] font-semibold tracking-tight">Pilot Light</span>
    </Link>
  );
}

export function TopBar({ wide = false }: { wide?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg print:hidden">
      <div className={`mx-auto flex h-14 items-center justify-between gap-3 px-5 ${wide ? "max-w-6xl" : "max-w-[440px]"}`}>
        <Wordmark />
        <a href="tel:911" className="text-[14px] font-semibold text-danger">
          Emergency? Call 911
        </a>
      </div>
    </header>
  );
}
