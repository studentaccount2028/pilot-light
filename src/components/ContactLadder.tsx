// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import type { ReactNode } from "react";
import { fmtTime, responderFor } from "@/lib/client/responders";
import type { AlertDto, ContactDto } from "@/lib/client/types";
import { IconPhone } from "./icons";

const KIND: Record<AlertDto["threshold"], string> = { h6: "6 h alert", h2: "2 h alert", h0: "0 h alert", help: "Help notice", all_clear: "All-clear" };

type Light = "idle" | "sending" | "sent" | "ok" | "way" | "help" | "failed" | "off";
const DOT: Record<Light, string> = {
  idle: "bg-surface-3",
  sending: "bg-warn animate-breathe",
  sent: "bg-warn",
  ok: "bg-ok",
  way: "bg-ink animate-breathe",
  help: "bg-danger",
  failed: "bg-danger",
  off: "bg-surface-3",
};
const TEXT: Record<Light, string> = { idle: "text-muted", sending: "text-warn", sent: "text-warn", ok: "text-ok", way: "text-ink", help: "text-danger", failed: "text-danger", off: "text-muted" };

function summarize(contact: ContactDto, alerts: AlertDto[]): { light: Light; text: string } {
  if (!contact.active) return { light: "off", text: "Opted out" };
  const mine = alerts.filter((a) => a.contactId === contact.id).sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
  const r = responderFor(contact, alerts);
  if (r?.stage === "arrived") return { light: "ok", text: `Arrived ${fmtTime(r.arrivedAt!)}` };
  if (r?.stage === "on_way") return { light: "way", text: `On the way · arrives ${fmtTime(r.etaAt!)}` };
  if (r?.stage === "help") return { light: "help", text: "Replied HELP" };
  if (r?.stage === "seen") return { light: "ok", text: `Saw the alert · replied OK ${fmtTime(r.seenAt!)}` };
  const sent = mine.find((a) => a.sid);
  if (sent) return { light: "sent", text: `${KIND[sent.threshold]} ${sent.channel === "sms" ? "texted" : "called"}` };
  if (mine.some((a) => a.lastError)) return { light: "failed", text: "Retrying" };
  if (mine.length > 0) return { light: "sending", text: "Sending" };
  return { light: "idle", text: "Not contacted yet" };
}

function when(c: ContactDto): string {
  if (c.isTownVolunteer) return "Town volunteer · at 0 hours";
  const how = c.channel === "sms" ? "Text" : c.channel === "voice" ? "Call" : "Text and call";
  if (c.priority <= 1) return `${how} · from 6 hours left`;
  if (c.priority === 2) return `${how} · from 2 hours left`;
  return `${how} · at 0 hours`;
}

const initials = (name: string) =>
  name
    .replace(/\(.*?\)/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";

// The escalation ladder as a plain list, in the order people are reached.
export function ContactLadder({ contacts, alerts, actions }: { contacts: ContactDto[]; alerts: AlertDto[]; actions?: (c: ContactDto) => ReactNode }) {
  return (
    <section>
      <ul className="divide-y divide-line border-y border-line">
        {contacts.map((c) => {
          const s = summarize(c, alerts);
          const extra = actions?.(c);
          return (
            <li key={c.id} className="py-3.5">
              <div className="flex items-center gap-3.5">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 text-[13px] font-semibold">
                  {initials(c.name)}
                  {s.light !== "idle" && s.light !== "off" && <span className={`absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full ring-[3px] ring-bg ${DOT[s.light]}`} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium">{c.name}</p>
                  <p className="truncate text-[13px] text-muted">{when(c)}</p>
                  <p className={`text-[13px] font-medium ${TEXT[s.light]}`}>{s.text}</p>
                </div>
                <a href={`tel:${c.phone}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-2 transition-colors hover:bg-surface-3" aria-label={`Call ${c.name}`}>
                  <IconPhone className="h-4 w-4" />
                </a>
              </div>
              {extra && <div className="mt-2.5 pl-[52px]">{extra}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
