// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IconChevron } from "./icons";

const KEY = "pl:recent";

export function rememberHousehold(id: string, label: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ id, label }));
  } catch {
    // storage blocked: the saved link still works
  }
}

export function RecentHousehold() {
  const [recent, setRecent] = useState<{ id: string; label: string } | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);
  if (!recent) return null;
  return (
    <Link href={`/h/${recent.id}`} className="btn h-12 w-full text-[17px]">
      Open {recent.label}
      <IconChevron className="h-4 w-4" />
    </Link>
  );
}
