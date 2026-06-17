"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Lock, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { usd } from "@/lib/format";
import { depositCooldownMs, useZoqo } from "@/lib/store";

interface Coin {
  key: string;
  label: string;
  addr: string;
  network: string;
}
const COINS: Coin[] = [
  { key: "BTC", label: "Bitcoin", addr: "bc1q9x7zoqo4m2yk8w0deposit3faucet5v2r6demo", network: "Bitcoin" },
  { key: "ETH", label: "Ethereum", addr: "0xZ0Q0a1b2C3d4E5f6789deADbeef00cAfe1234567", network: "ERC-20" },
  { key: "USDT", label: "Tether", addr: "0xZ0Q0a1b2C3d4E5f6789deADbeef00cAfe1234567", network: "ERC-20" },
  { key: "LTC", label: "Litecoin", addr: "ltc1qzoqo7demo9faucet2deposit5address0v8x3", network: "Litecoin" },
];

/** mm:ss or hh:mm:ss countdown. */
function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${pad(m)}:${pad(r)}`;
}

export function DepositModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { deposit, depositCount, nextDepositAt, depositAmount, cash } = useZoqo();
  const [coin, setCoin] = React.useState("BTC");
  const [copied, setCopied] = React.useState(false);
  const [credited, setCredited] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);

  // reset transient state when reopened
  React.useEffect(() => {
    if (open) setCredited(false);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const active = COINS.find((c) => c.key === coin)!;
  const locked = now < nextDepositAt;
  const remaining = nextDepositAt - now;
  // wait until the next deposit = the cooldown just applied for the current count
  const nextWaitLabel = labelFor(depositCooldownMs(depositCount));

  function confirm() {
    const ok = deposit();
    if (ok) setCredited(true);
  }

  function copy() {
    navigator.clipboard?.writeText(active.addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-gray-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-[20px] border bg-surface shadow-[0_24px_64px_rgba(14,17,19,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-display text-[20px] font-black leading-none">Deposit</h2>
            <p className="mt-1 text-[12px] text-sub">Balance {usd(cash)}</p>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-gray-100">
            <X size={18} className="text-sub" />
          </button>
        </div>

        {credited ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-green-100">
              <Check size={28} className="text-green-600" />
            </div>
            <h3 className="text-[18px] font-bold">{usd(depositAmount)} credited</h3>
            <p className="text-[13px] text-sub">
              It&apos;s in your balance now. Your winnings stay yours — keep trading.
            </p>
            <p className="text-[12px] text-sub">
              Next deposit unlocks in <b className="text-ink">{nextWaitLabel}</b>.
            </p>
            <Button color="brand" fullWidth size="lg" onClick={onClose} className="mt-2">
              Start trading
            </Button>
          </div>
        ) : (
          <div className="px-5 py-4">
            {/* currency tabs */}
            <div className="mb-4 grid grid-cols-4 gap-2">
              {COINS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setCoin(c.key)}
                  className={cn(
                    "rounded-[10px] border py-2 text-[12px] font-bold transition-colors",
                    coin === c.key ? "border-purple-500 bg-purple-50 text-purple-700" : "hover:bg-gray-50",
                  )}
                >
                  {c.key}
                </button>
              ))}
            </div>

            {/* amount */}
            <div className="mb-4 flex items-center justify-between rounded-[12px] bg-muted px-4 py-3">
              <span className="text-[13px] text-sub">Deposit amount</span>
              <span className="font-bebas text-[22px] nums">{usd(depositAmount)}</span>
            </div>

            {/* QR + address */}
            <div className="flex gap-3 rounded-[12px] border p-3">
              <FakeQR seed={active.addr} />
              <div className="flex min-w-0 flex-1 flex-col justify-between">
                <div>
                  <div className="text-[11px] text-sub">{active.label} · {active.network}</div>
                  <div className="mt-1 break-all font-mono text-[11px] leading-snug text-ink">{active.addr}</div>
                </div>
                <button
                  onClick={copy}
                  className="mt-2 inline-flex items-center gap-1.5 self-start rounded-[8px] border px-2.5 py-1.5 text-[12px] font-semibold hover:bg-gray-50"
                >
                  {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                  {copied ? "Copied" : "Copy address"}
                </button>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-sub">
              Send only {active.key} on the {active.network} network. This is a demo faucet — no real
              crypto required. Tap below once you&apos;ve &ldquo;paid&rdquo; and we credit{" "}
              {usd(depositAmount)} in play money.
            </p>

            {locked ? (
              <div className="mt-4 flex flex-col items-center gap-1 rounded-[12px] bg-gold-50 py-4 text-center">
                <Lock size={18} className="text-gold-700" />
                <span className="text-[13px] font-bold text-gold-800 nums">Next deposit in {fmt(remaining)}</span>
                <span className="text-[11px] text-gold-700">
                  Faucet cooldown — deposits open up on a schedule.
                </span>
              </div>
            ) : (
              <Button color="brand" fullWidth size="lg" onClick={confirm} className="mt-4">
                I&apos;ve paid · credit {usd(depositAmount)}
              </Button>
            )}

            <p className="mt-3 text-center text-[10.5px] text-sub">
              Cooldowns grow each time: free → 1h → 2h → 3h → then once a day.
              {depositCount > 0 && ` You've deposited ${depositCount}×.`}
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function labelFor(ms: number): string {
  if (ms <= 0) return "now";
  const h = Math.round(ms / 3600_000);
  return h >= 24 ? "a day" : `${h}h`;
}

/** Deterministic QR-looking grid (visual only). */
function FakeQR({ seed }: { seed: string }) {
  const N = 21;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const cells: boolean[] = [];
  let x = Math.abs(h) || 1;
  for (let i = 0; i < N * N; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    cells.push((x >> 8) % 100 < 48);
  }
  const isFinder = (r: number, c: number) => {
    const inBox = (br: number, bc: number) => r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return inBox(0, 0) || inBox(0, N - 7) || inBox(N - 7, 0);
  };
  return (
    <div
      className="grid h-[104px] w-[104px] shrink-0 overflow-hidden rounded-[8px] bg-white p-1"
      style={{ gridTemplateColumns: `repeat(${N}, 1fr)` }}
    >
      {cells.map((on, i) => {
        const r = Math.floor(i / N);
        const c = i % N;
        const finder = isFinder(r, c);
        const finderOn =
          finder &&
          (() => {
            const lr = r % 7 === 0 || r % 7 === 6 || c % 7 === 0 || c % 7 === 6 || (r % 7 >= 2 && r % 7 <= 4 && c % 7 >= 2 && c % 7 <= 4);
            return lr;
          })();
        const fill = finder ? finderOn : on;
        return <span key={i} className={fill ? "bg-gray-900" : "bg-transparent"} />;
      })}
    </div>
  );
}
