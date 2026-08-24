import { Suspense } from "react";
import { TerminalShell } from "@/components/terminal/TerminalShell";
import { AppHeader } from "@/components/trade/AppHeader";

export const metadata = { title: "Terminal — ZOQO" };

/** The new multi-asset, position-based trading terminal (crypto/gold/forex).
 *  Sits alongside /trade (the BTC prediction market, unchanged) rather than
 *  replacing it — see TERMINAL_SPEC.md §1 for why these are two distinct
 *  trading mechanics, not one engine wearing two skins.
 *
 *  Suspense boundary is required by useSearchParams() (TerminalShell reads
 *  the Mock Trade deep-link's ?mockLesson= param) — Next.js needs a
 *  fallback for the render pass before search params are available. */
export default function TerminalPage() {
  return (
    <>
      <AppHeader />
      <Suspense>
        <TerminalShell />
      </Suspense>
    </>
  );
}
