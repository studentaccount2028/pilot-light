// AI-assisted: written with Claude Code from the team's build spec.
import Link from "next/link";
import { IconBolt, IconCloud, IconMessage, IconPhone } from "@/components/icons";
import { RecentHousehold } from "@/components/RecentHousehold";
import { PhoneStage } from "@/components/Phone";
import { TopBar } from "@/components/TopBar";

const STEPS = [
  { icon: IconBolt, title: "List what needs power", body: "The address, each medical device, and how long it runs without the grid." },
  { icon: IconPhone, title: "A phone at the house checks in", body: "Every few minutes, on its own. The person who lives there does nothing." },
  { icon: IconCloud, title: "Storm plus silence starts the clock", body: "A weather warning and 20 quiet minutes mean the power is probably out." },
  { icon: IconMessage, title: "People are told in time", body: "Texts and calls at 6 hours, 2 hours and zero. They reply OK or HELP." },
];

export default function Home() {
  return (
    <PhoneStage>
      <TopBar />
      <main className="mx-auto max-w-[440px] px-5 pb-12">
        <section className="pt-10">
          <h1 className="font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.035em]">Someone is told before the battery runs out.</h1>
          <p className="mt-5 text-[17px] leading-relaxed text-ink-2">
            Pilot Light counts down a medically dependent rural senior&apos;s backup-battery hours during a winter power outage and texts and calls their family,
            a neighbor, and their town before the clock runs out.
          </p>
          <div className="mt-8 space-y-3">
            <Link href="/h/new" className="btn btn-primary h-12 w-full text-[17px]">
              Set up a household
            </Link>
            <RecentHousehold />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="h-section">How it works</h2>
          <ol className="mt-2 divide-y divide-line">
            {STEPS.map((s) => (
              <li key={s.title} className="flex gap-4 py-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface-2">
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[16px] font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-[15px] leading-snug text-muted">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-8 text-[13px] leading-relaxed text-muted">Pilot Light makes sure someone checks. It is not a medical device and it does not replace 911.</p>
      </main>
    </PhoneStage>
  );
}
