// AI-assisted: written with Claude Code from the team's build spec.
import type { ReactNode } from "react";

function StatusBar() {
  return (
    <div className="relative flex h-11 shrink-0 items-center justify-between bg-bg px-7 text-[14px] font-semibold text-white" aria-hidden>
      <span className="tabular-nums">9:41</span>
      <span className="absolute left-1/2 top-2 h-[26px] w-[104px] -translate-x-1/2 rounded-full bg-[#0a0a0a] ring-1 ring-[#1c1c1c]" />
      <span className="flex items-center gap-1.5">
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor">
          <rect x="0" y="7" width="3" height="4" rx="0.7" />
          <rect x="4.6" y="5" width="3" height="6" rx="0.7" />
          <rect x="9.2" y="2.5" width="3" height="8.5" rx="0.7" />
          <rect x="13.8" y="0" width="3" height="11" rx="0.7" />
        </svg>
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none">
          <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="16" height="8" rx="1.6" fill="currentColor" />
          <rect x="23" y="4" width="1.5" height="4" rx="0.7" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

// A phone, always drawn. The screen scrolls inside it, and anything
// position:fixed inside sticks to the screen edges, not the browser window.
export function Phone({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`relative mx-auto flex h-[812px] max-h-[calc(100dvh-48px)] w-full max-w-[390px] flex-col overflow-hidden rounded-[54px] border-[11px] border-[#1b1b1b] bg-bg outline outline-1 outline-[#3a3a3a] [transform:translateZ(0)] ${className}`}>
      <StatusBar />
      <div data-phone-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none]">{children}</div>
      <span className="pointer-events-none absolute bottom-1.5 left-1/2 z-50 h-[5px] w-[130px] -translate-x-1/2 rounded-full bg-white/55" aria-hidden />
    </div>
  );
}

// Full-page wrapper: on a real phone the app fills the screen; on anything
// wider it is shown inside a phone so it reads as the mobile app it is.
export function PhoneStage({ children }: { children: ReactNode }) {
  return (
    <div className="sm:flex sm:min-h-dvh sm:items-center sm:justify-center sm:bg-[#070707] sm:py-6">
      <div className="relative sm:flex sm:h-[812px] sm:max-h-[calc(100dvh-48px)] sm:w-[390px] sm:flex-col sm:overflow-hidden sm:rounded-[54px] sm:border-[11px] sm:border-[#1b1b1b] sm:bg-bg sm:outline sm:outline-1 sm:outline-[#3a3a3a] sm:[transform:translateZ(0)]">
        <div className="hidden sm:block">
          <StatusBar />
        </div>
        <div data-phone-scroll className="sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:overscroll-contain sm:[scrollbar-width:none]">{children}</div>
        <span className="pointer-events-none absolute bottom-1.5 left-1/2 z-50 hidden h-[5px] w-[130px] -translate-x-1/2 rounded-full bg-white/55 sm:block" aria-hidden />
      </div>
    </div>
  );
}

// Back to the top of whichever surface is scrolling: the phone screen or the page.
export function scrollAppToTop() {
  document.querySelectorAll("[data-phone-scroll]").forEach((el) => (el.scrollTop = 0));
  window.scrollTo({ top: 0 });
}
