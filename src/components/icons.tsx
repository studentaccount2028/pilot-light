// AI-assisted: written with Claude Code from the team's build spec.
// One icon set: 24px grid, 1.5px stroke, round caps and joins, no fills.
// Icons take the text colour of whatever they sit in.
import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;
const base = {
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// The brand mark. The only icon with colour.
export function Flame({ className, ...p }: P) {
  return (
    <svg viewBox="0 0 32 40" width={32} height={40} aria-hidden className={className} {...p}>
      <defs>
        <linearGradient id="pl-flame-outer" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff5a1f" />
          <stop offset="1" stopColor="#ffb347" />
        </linearGradient>
        <linearGradient id="pl-flame-inner" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffd98a" />
          <stop offset="1" stopColor="#fff6dc" />
        </linearGradient>
      </defs>
      <path d="M16 1c1.5 6.5 10 11 10 22a10 10 0 0 1-20 0c0-4.5 2.2-7.3 4-9.5.6 2.8 2 4.5 3.5 5C13 13.5 12.5 6.5 16 1Z" fill="url(#pl-flame-outer)" />
      <path d="M16.2 19c.8 3 4.3 4.8 4.3 9a4.5 4.5 0 0 1-9 0c0-2 1-3.4 1.9-4.4.4 1.3 1 2 1.7 2.3-.3-2.4-.2-4.9 1.1-6.9Z" fill="url(#pl-flame-inner)" />
    </svg>
  );
}

const icon = (children: React.ReactNode) => {
  const Icon = (p: P) => (
    <svg {...base} {...p}>
      {children}
    </svg>
  );
  return Icon;
};

export const IconHome = icon(
  <>
    <path d="M3 10.2a2 2 0 0 1 .7-1.5l7-6a2 2 0 0 1 2.6 0l7 6a2 2 0 0 1 .7 1.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 21v-7a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v7" />
  </>,
);
export const IconPeople = icon(
  <>
    <circle cx="9" cy="7.5" r="3.5" />
    <path d="M2.5 20v-1a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1" />
    <path d="M16 4.2a3.5 3.5 0 0 1 0 6.6" />
    <path d="M18.5 14.3a5 5 0 0 1 3 4.7v1" />
  </>,
);
export const IconClock = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);
// House details and settings: a row of sliders.
export const IconHouse = icon(
  <>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </>,
);
export const IconGear = icon(
  <>
    <path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.8l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.8v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
export const IconPhone = icon(
  <path d="M21 16.5v2.7a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.8-2.8 17.5 17.5 0 0 1-5.4-5.4A17.8 17.8 0 0 1 3 4.9 1.8 1.8 0 0 1 4.8 3h2.7a1.8 1.8 0 0 1 1.8 1.5c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9L8.4 10a14.4 14.4 0 0 0 5.4 5.4l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.7 2z" />,
);
export const IconMessage = icon(<path d="M7.8 19.7A8.5 8.5 0 1 0 4.3 16.2L3 21z" />);
export const IconBolt = icon(<path d="M13 2.5 4.5 13.2a.5.5 0 0 0 .4.8H11l-1 7.5 8.5-10.7a.5.5 0 0 0-.4-.8H12z" />);
export const IconCheck = icon(<path d="M20 6.5 9.5 17 4 11.5" />);
export const IconChevron = icon(<path d="m9 6 6 6-6 6" />);
export const IconPin = icon(
  <>
    <path d="M19.5 10c0 4.7-5.2 9.6-7 11.1a.8.8 0 0 1-1 0c-1.8-1.5-7-6.4-7-11.1a7.5 7.5 0 0 1 15 0z" />
    <circle cx="12" cy="10" r="2.5" />
  </>,
);
// Fire and rescue.
export const IconFlame = icon(
  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4.1 2-6 .5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z" />,
);
// Police.
export const IconShield = icon(
  <path d="M20 12.8c0 4.7-3.3 7-7.3 8.4a1.2 1.2 0 0 1-.8 0C7.5 19.8 4 17.5 4 12.8V6.2a1 1 0 0 1 .9-1c2-.2 4.2-1.2 6.2-2.6a1.5 1.5 0 0 1 1.8 0c2 1.4 4.2 2.4 6.2 2.6a1 1 0 0 1 .9 1z" />,
);
// Hospital: a building with a cross.
export const IconHospital = icon(
  <>
    <path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
    <path d="M6 10H4a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-2" />
    <path d="M12 6.5v4M10 8.5h4" />
    <path d="M10 21v-4h4v4" />
  </>,
);
export const IconCloud = icon(
  <>
    <path d="M7 17.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.6 1.6 3.8 3.8 0 0 1-.5 7.4z" />
    <path d="M9 20.5v.1M12.5 21.5v.1M16 20.5v.1" />
  </>,
);
export const IconAlert = icon(
  <>
    <path d="M10.3 3.9 2.5 17.5a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4M12 17v.1" />
  </>,
);
export const IconPulse = icon(<path d="M3 12h4l2.5-7 5 14 2.5-7h4" />);
export const IconMap = icon(
  <>
    <path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </>,
);
export const IconList = icon(<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.1M3.5 12h.1M3.5 18h.1" />);
export const IconMore = icon(<path d="M5 12h.1M12 12h.1M19 12h.1" strokeWidth={2.6} />);
export const IconPlay = icon(<path d="M7 4.5v15a.5.5 0 0 0 .8.4l11.4-7.5a.5.5 0 0 0 0-.8L7.8 4.1a.5.5 0 0 0-.8.4z" />);
export const IconReset = icon(
  <>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.7-6.2L3.5 8.5" />
    <path d="M3.5 3.5v5h5" />
  </>,
);
export const IconUser = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M5 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1" />
  </>,
);
// Leaving the house.
export const IconDoor = icon(
  <>
    <path d="M13 4.6v16.1a1 1 0 0 1-1.2 1L5 20V5.6a2 2 0 0 1 1.5-2l4-1a2 2 0 0 1 2.5 2z" />
    <path d="M13 4h3a2 2 0 0 1 2 2v14M2 20h3M13 20h9M10 12v.1" />
  </>,
);
export const IconCalendar = icon(
  <>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M8 3v4M16 3v4M3 10h18" />
  </>,
);
export const IconBattery = icon(
  <>
    <rect x="2" y="7.5" width="17" height="9" rx="2" />
    <path d="M22 10.5v3M6 10.5v3M9.5 10.5v3" />
  </>,
);
// Getting to the backup and switching it on.
export const IconPlug = icon(<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z" />);
