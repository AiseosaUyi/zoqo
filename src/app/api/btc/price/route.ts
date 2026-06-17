import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/** Latest BTC/USD spot — used as the polling fallback when no WebSocket is available. */
async function bitstamp(): Promise<number> {
  const res = await fetch("https://www.bitstamp.net/api/v2/ticker/btcusd/", {
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`bitstamp ${res.status}`);
  const j = await res.json();
  return Number(j.last);
}

async function coingecko(): Promise<number> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    { cache: "no-store", signal: AbortSignal.timeout(5000) },
  );
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const j = await res.json();
  return Number(j.bitcoin.usd);
}

export async function GET() {
  for (const [name, fn] of [
    ["bitstamp", bitstamp],
    ["coingecko", coingecko],
  ] as const) {
    try {
      const price = await fn();
      if (price > 0)
        return NextResponse.json(
          { source: name, price, ts: Date.now() },
          { headers: { "cache-control": "no-store" } },
        );
    } catch {
      /* try next */
    }
  }
  return NextResponse.json({ source: "none", price: 0, ts: Date.now() }, { status: 502 });
}
