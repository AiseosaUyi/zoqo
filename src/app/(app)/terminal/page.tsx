import { TerminalShell } from "@/components/terminal/TerminalShell";
import { AppHeader } from "@/components/trade/AppHeader";

export const metadata = { title: "Terminal — ZOQO" };

/** The new multi-asset, position-based trading terminal (crypto/gold/forex).
 *  Sits alongside /trade (the BTC prediction market, unchanged) rather than
 *  replacing it — see TERMINAL_SPEC.md §1 for why these are two distinct
 *  trading mechanics, not one engine wearing two skins. */
export default function TerminalPage() {
  return (
    <>
      <AppHeader />
      <TerminalShell />
    </>
  );
}
