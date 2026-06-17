"use client";
import { useEffect, useRef, useState } from "react";
import type { Candle } from "./types";
import { DEFAULT_TF, TF_BY_KEY } from "./timeframe";

interface SeriesPoint {
  t: number;
  p: number;
}

/**
 * Resolve the price series + visible range for the selected timeframe.
 * Short frames reuse the live 1-minute series; long frames fetch coarser
 * candles once per timeframe change. `bands` = show the 5-min market overlay.
 */
export function useChartSeries(timeframe: string, liveSeries: SeriesPoint[]) {
  const tf = TF_BY_KEY[timeframe] ?? TF_BY_KEY[DEFAULT_TF];
  const [longSeries, setLongSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tf.live) return;
    let cancelled = false;
    setLoading(true);
    fetchHistory(tf.interval, tf.limit)
      .then(({ candles }) => {
        if (cancelled) return;
        setLongSeries(candles.map((c) => ({ t: c.t, p: c.c })));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tf.key, tf.live, tf.interval, tf.limit]);

  return {
    series: tf.live ? liveSeries : longSeries,
    rangeMs: tf.ms,
    bands: tf.bands,
    loading: tf.live ? false : loading,
  };
}

export interface LiveBtc {
  price: number | null;
  source: string;
  connected: boolean;
}

interface WsSpec {
  name: string;
  url: string;
  sub?: object; // message to send on open
  parse: (msg: unknown) => number | null;
}

const FEEDS: WsSpec[] = [
  {
    name: "binance",
    url: "wss://stream.binance.com:9443/ws/btcusdt@trade",
    parse: (m) => {
      const d = m as { p?: string };
      return d.p ? Number(d.p) : null;
    },
  },
  {
    name: "coinbase",
    url: "wss://ws-feed.exchange.coinbase.com",
    sub: { type: "subscribe", product_ids: ["BTC-USD"], channels: ["ticker"] },
    parse: (m) => {
      const d = m as { type?: string; price?: string };
      return d.type === "ticker" && d.price ? Number(d.price) : null;
    },
  },
  {
    name: "bitstamp",
    url: "wss://ws.bitstamp.net",
    sub: { event: "bts:subscribe", data: { channel: "live_trades_btcusd" } },
    parse: (m) => {
      const d = m as { event?: string; data?: { price?: number } };
      return d.event === "trade" && d.data?.price ? Number(d.data.price) : null;
    },
  },
];

/**
 * Maintains the latest live BTC price. Tries each exchange WebSocket in turn;
 * if none connect (blocked/geo), polls the server `/api/btc/price` route.
 * Writes every tick to `priceRef` so a sim loop can read it without re-rendering.
 */
export function useLiveBtc(seed?: number, priceRef?: React.MutableRefObject<number>): LiveBtc {
  const [state, setState] = useState<LiveBtc>({
    price: seed ?? null,
    source: "…",
    connected: false,
  });

  useEffect(() => {
    let killed = false;
    let ws: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    const set = (price: number, source: string, connected: boolean) => {
      if (killed || !(price > 0)) return;
      if (priceRef) priceRef.current = price;
      setState({ price, source, connected });
    };

    const startPolling = () => {
      if (pollTimer) return;
      const poll = async () => {
        try {
          const r = await fetch("/api/btc/price", { cache: "no-store" });
          const j = await r.json();
          if (j.price > 0) set(j.price, `${j.source} (poll)`, true);
        } catch {
          /* keep last */
        }
      };
      poll();
      pollTimer = setInterval(poll, 4000);
    };

    const tryFeed = (i: number) => {
      if (killed) return;
      if (i >= FEEDS.length) {
        startPolling();
        return;
      }
      const feed = FEEDS[i];
      let gotData = false;
      try {
        ws = new WebSocket(feed.url);
      } catch {
        tryFeed(i + 1);
        return;
      }
      // If no data within 5s, move on to the next feed.
      connectTimer = setTimeout(() => {
        if (!gotData) {
          try {
            ws?.close();
          } catch {}
          tryFeed(i + 1);
        }
      }, 5000);

      ws.onopen = () => {
        if (feed.sub) ws?.send(JSON.stringify(feed.sub));
      };
      ws.onmessage = (ev) => {
        try {
          const price = feed.parse(JSON.parse(ev.data));
          if (price && price > 0) {
            gotData = true;
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
          // lost a working feed — fall back to polling to stay live
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return state;
}

/** One-shot history fetch via the server route (with all its fallbacks). */
export async function fetchHistory(
  interval: string,
  limit: number,
): Promise<{ source: string; candles: Candle[] }> {
  const r = await fetch(`/api/btc/history?interval=${interval}&limit=${limit}`, {
    cache: "no-store",
  });
  if (!r.ok) return { source: "none", candles: [] };
  return r.json();
}
