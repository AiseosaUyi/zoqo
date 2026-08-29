"use client";
import { useEffect, useRef, useState } from "react";
import { ASSET_BY_ID, type AssetDef } from "./assets";
import { mulberry32, gaussian } from "./math";

export interface LivePrice {
  price: number | null;
  source: string;
  connected: boolean;
  /** true when the price is a synthesized tick between real polls, not a
   *  fresh observation — surfaced so the UI can show a "sim" badge rather
   *  than implying tick-real data it doesn't have (same honesty rule the
   *  original Poisson tape follows). */
  synthetic: boolean;
}

const CRYPTO_POLL_FALLBACK_MS = 4000;
const REST_POLL_MS = 30_000;
const SYNTH_TICK_MS = 600;

/**
 * Generalized version of useBtc.ts's useLiveBtc — one hook, any asset in the
 * registry. Crypto keeps the real WS-fallback-to-poll chain (binance →
 * coinbase → server poll). Gold/forex poll /api/quotes/[id] every 30s for a
 * real anchor and synthesize a smooth random walk in between, exactly the
 * way MarketEngine already synthesizes BTC's order book off the real price —
 * same trick, applied to the price line itself where no free real-time feed
 * exists (see TERMINAL_SPEC.md §3).
 */
export function useAssetPrice(assetId: string): LivePrice {
  const asset = ASSET_BY_ID[assetId];
  const [state, setState] = useState<LivePrice>({
    price: null,
    source: "…",
    connected: false,
    synthetic: false,
  });
  const rngRef = useRef(mulberry32(hashSeed(assetId)));

  useEffect(() => {
    if (!asset) return;
    let killed = false;

    if (asset.assetClass === "crypto") {
      return subscribeCrypto(asset, (price, source, connected) => {
        if (!killed) setState({ price, source, connected, synthetic: false });
      });
    }

    // REST-polled classes: fetch a real anchor, synthesize ticks in between.
    let anchor = 0;
    let anchorSource = "mock";
    const vol = asset.syntheticVolPerTick ?? 0.00003;

    const poll = async () => {
      try {
        const r = await fetch(`/api/quotes/${asset.id}`, { cache: "no-store" });
        const j = await r.json();
        if (j.price > 0) {
          anchor = j.price;
          anchorSource = j.mock ? "mock" : j.source;
          if (!killed) setState({ price: anchor, source: anchorSource, connected: true, synthetic: false });
        }
      } catch {
        /* keep last anchor */
      }
    };
    poll();
    const pollTimer = setInterval(poll, REST_POLL_MS);

    const synthTimer = setInterval(() => {
      if (killed || anchor <= 0) return;
      anchor = Math.max(0.0001, anchor * (1 + gaussian(rngRef.current) * vol));
      setState({ price: anchor, source: anchorSource, connected: true, synthetic: true });
    }, SYNTH_TICK_MS);

    return () => {
      killed = true;
      clearInterval(pollTimer);
      clearInterval(synthTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  return state;
}

/** Deterministic per-asset seed (no Date.now() — keeps this pure so it's
 *  safe to call during render, unlike a wall-clock-based seed). */
function hashSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}

function subscribeCrypto(
  asset: AssetDef,
  set: (price: number, source: string, connected: boolean) => void,
): () => void {
  let killed = false;
  let ws: WebSocket | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  // Set the instant a WS tick lands, checked by the one-shot immediate poll
  // below before it writes state. Without this, a real bug: the poll and
  // the WS race with no ordering guarantee (the poll is a fetch through
  // this app's own server, which itself calls an external API — nothing
  // stops it resolving *after* the WS has already connected and delivered
  // ticks), so a late poll response could silently flip a live connection
  // back to "(poll)" — the ticker would look right but read as perpetually
  // delayed. Confirmed live via LiveDot: Terminal showed "Delayed" while
  // /trade's equivalent BTC feed (useBtc.ts, no competing one-shot poll)
  // showed "Live" in the same test run.
  let wsConnected = false;

  const startPolling = () => {
    if (pollTimer) return;
    const poll = async () => {
      // Server-side poll fallback, same role /api/btc/price plays for
      // useBtc.ts — routes through the server so it stays reachable even
      // when Binance/Coinbase are DNS-blocked client-side (see CLAUDE.md).
      try {
        const r = await fetch(`/api/crypto/${asset.id}`, { cache: "no-store" });
        const j = await r.json();
        if (j.price > 0) set(j.price, `${j.source} (poll)`, true);
      } catch {
        /* keep last */
      }
    };
    poll();
    pollTimer = setInterval(poll, CRYPTO_POLL_FALLBACK_MS);
  };

  const feeds = asset.ws
    ? [
        {
          name: "binance",
          url: `wss://stream.binance.com:9443/ws/${asset.ws.binance}`,
          parse: (m: unknown) => {
            const d = m as { p?: string };
            return d.p ? Number(d.p) : null;
          },
        },
        {
          name: "coinbase",
          url: "wss://ws-feed.exchange.coinbase.com",
          sub: { type: "subscribe", product_ids: [asset.ws.coinbase], channels: ["ticker"] },
          parse: (m: unknown) => {
            const d = m as { type?: string; price?: string };
            return d.type === "ticker" && d.price ? Number(d.price) : null;
          },
        },
        {
          name: "bitstamp",
          url: "wss://ws.bitstamp.net",
          sub: { event: "bts:subscribe", data: { channel: `live_trades_${asset.id}` } },
          parse: (m: unknown) => {
            const d = m as { event?: string; data?: { price?: number } };
            return d.event === "trade" && d.data?.price ? Number(d.data.price) : null;
          },
        },
      ]
    : [];

  // Fire one immediate REST poll in parallel with the WS attempts below so
  // there's a real price within ~1 round-trip instead of waiting out the
  // full fallback chain (up to ~10s across two failed WS hops — 5s connect
  // timeout each — before landing on polling). This is what made the
  // terminal feel like it was hanging on load, especially where Binance/
  // Coinbase are DNS-blocked (see CLAUDE.md). Whichever source responds
  // first paints; later ticks from either source just overwrite it as normal.
  fetch(`/api/crypto/${asset.id}`, { cache: "no-store" })
    .then((r) => r.json())
    .then((j) => {
      if (!killed && !wsConnected && j.price > 0) set(j.price, `${j.source} (poll)`, true);
    })
    .catch(() => {});

  const tryFeed = (i: number) => {
    if (killed) return;
    if (i >= feeds.length) {
      startPolling();
      return;
    }
    const feed = feeds[i];
    let gotData = false;
    try {
      ws = new WebSocket(feed.url);
    } catch {
      tryFeed(i + 1);
      return;
    }
    connectTimer = setTimeout(() => {
      if (!gotData) {
        try {
          ws?.close();
        } catch {}
        tryFeed(i + 1);
      }
    }, 5000);

    ws.onopen = () => {
      if ("sub" in feed && feed.sub) ws?.send(JSON.stringify(feed.sub));
    };
    ws.onmessage = (ev) => {
      try {
        const price = feed.parse(JSON.parse(ev.data));
        if (price && price > 0) {
          gotData = true;
          wsConnected = true;
          if (connectTimer) {
            clearTimeout(connectTimer);
            connectTimer = null;
          }
          set(price, feed.name, true);
        }
      } catch {
        /* ignore */
      }
    };
    ws.onerror = () => {
      if (!gotData) {
        try {
          ws?.close();
        } catch {}
      }
    };
    ws.onclose = () => {
      if (killed) return;
      if (!gotData) tryFeed(i + 1);
      else {
        wsConnected = false; // lost a working feed — recurring polling below is the real fallback now, not a race
        startPolling();
      }
    };
  };

  tryFeed(0);

  return () => {
    killed = true;
    if (connectTimer) clearTimeout(connectTimer);
    if (pollTimer) clearInterval(pollTimer);
    try {
      ws?.close();
    } catch {}
  };
}
