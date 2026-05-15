"use client";

import dynamic from "next/dynamic";

// The terminal page is entirely client-side (xterm, SSH, localStorage, matchMedia).
// Disable SSR to prevent hydration mismatches from theme/color mode resolution.
const TerminalPageClient = dynamic(() => import("./terminal-client"), {
  ssr: false,
});

export default function TerminalPage() {
  return <TerminalPageClient />;
}
