// AI-assisted: written with Claude Code from the team's build spec.
"use client";
import { useEffect } from "react";
import { startNative } from "@/lib/native";

// Runs once in the iOS app (nothing on the web): status bar, launch screen, alert permission.
export function NativeBridge() {
  useEffect(() => {
    startNative();
  }, []);
  return null;
}
