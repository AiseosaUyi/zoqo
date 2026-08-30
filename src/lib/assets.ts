// Multi-asset registry for the trading terminal.
//
// Three asset classes ship in this pass: crypto (real WebSocket feeds, same
// pattern as the original BTC-only `useBtc.ts`), gold, and the top forex
// majors (both via `/api/quotes/[symbol]`, since no free real-time WS feed
// exists for forex/gold — see TERMINAL_SPEC.md §3). The BTC prediction
// market's own feed (`useBtc.ts`) is untouched; this registry drives the new
// position-based Terminal, not `/trade`.

export type AssetClass = "crypto" | "gold" | "forex";

export interface AssetDef {
  /** Stable id used in URLs, localStorage keys, and API routes. */
  id: string;
  /** Human display symbol, e.g. "BTC/USD". */
  symbol: string;
  label: string;
  assetClass: AssetClass;
  /** Decimal places for price display (JPY pairs need 3, most FX needs 4-5, crypto/gold 2). */
  decimals: number;
  /** Per-tick synthesized volatility (log-return stdev) for the REST-polled
   *  classes (gold/forex) — see useAssetPrice's random-walk smoothing.
   *  Crypto doesn't use this; it gets real tick-by-tick data from the WS feed. */
  syntheticVolPerTick?: number;
  /** Binance/Coinbase product ids for the crypto WS feeds. */
  ws?: { binance: string; coinbase: string };
  /** Price-grouping tick sizes offered by the terminal's simulated order
   *  book (finest → coarsest), e.g. BTC's book can bucket into $1/$10/$100
   *  bands. Explicit per asset rather than derived from `decimals` so the
   *  options stay sane numbers a trader would actually pick from. */
  bookTicks: number[];
}

export const ASSETS: AssetDef[] = [
  {
    id: "btcusd",
    symbol: "BTC/USD",
    label: "Bitcoin",
    assetClass: "crypto",
    decimals: 2,
    ws: { binance: "btcusdt@trade", coinbase: "BTC-USD" },
    bookTicks: [1, 10, 100, 1000],
  },
  {
    id: "ethusd",
    symbol: "ETH/USD",
    label: "Ethereum",
    assetClass: "crypto",
    decimals: 2,
    ws: { binance: "ethusdt@trade", coinbase: "ETH-USD" },
    bookTicks: [0.1, 1, 10, 100],
  },
  {
    id: "solusd",
    symbol: "SOL/USD",
    label: "Solana",
    assetClass: "crypto",
    decimals: 2,
    ws: { binance: "solusdt@trade", coinbase: "SOL-USD" },
    bookTicks: [0.01, 0.1, 1, 10],
  },
  {
    id: "xauusd",
    symbol: "XAU/USD",
    label: "Gold",
    assetClass: "gold",
    decimals: 2,
    syntheticVolPerTick: 0.00006,
    bookTicks: [0.1, 1, 10],
  },
  {
    id: "eurusd",
    symbol: "EUR/USD",
    label: "Euro / US Dollar",
    assetClass: "forex",
    decimals: 5,
    syntheticVolPerTick: 0.00002,
    bookTicks: [0.00001, 0.0001, 0.001],
  },
  {
    id: "gbpusd",
    symbol: "GBP/USD",
    label: "British Pound / US Dollar",
    assetClass: "forex",
    decimals: 5,
    syntheticVolPerTick: 0.00003,
    bookTicks: [0.00001, 0.0001, 0.001],
  },
  {
    id: "usdjpy",
    symbol: "USD/JPY",
    label: "US Dollar / Japanese Yen",
    assetClass: "forex",
    decimals: 3,
    syntheticVolPerTick: 0.00002,
    bookTicks: [0.001, 0.01, 0.1],
  },
];

export const ASSET_BY_ID: Record<string, AssetDef> = Object.fromEntries(
  ASSETS.map((a) => [a.id, a]),
);

export const DEFAULT_ASSET_ID = "btcusd";

export function assetClassLabel(c: AssetClass): string {
  return c === "crypto" ? "Crypto" : c === "gold" ? "Metals" : "Forex";
}
