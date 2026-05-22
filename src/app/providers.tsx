"use client";

import { MascotProvider } from "@mascotbot/react";

/**
 * Single licensed inference client for the whole app. The publishable
 * mascot_dev_/mascot_pub_ key is browser-safe (scoped to your origins).
 * On localhost the SDK auto-detects dev mode and skips the origin
 * allow-list, so a mascot_dev_ key just works here.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const apiKey = process.env.NEXT_PUBLIC_MASCOT_KEY;
  if (!apiKey) {
    return (
      <div style={{ padding: 24, fontFamily: "monospace", color: "#b00" }}>
        NEXT_PUBLIC_MASCOT_KEY is not set. Copy <code>.env.example</code> to{" "}
        <code>.env.local</code> and add your MascotBot key.
      </div>
    );
  }
  return <MascotProvider apiKey={apiKey}>{children}</MascotProvider>;
}
