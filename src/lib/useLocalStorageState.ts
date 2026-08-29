"use client";
import * as React from "react";

interface Snapshot<T> {
  ready: boolean;
  value: T;
}

/**
 * SSR-safe localStorage-backed state via useSyncExternalStore. Renders
 * `defaultValue` on the server and during the client's first (hydration-
 * matching) render, then swaps to the real persisted value right after —
 * React's own built-in mechanism for "the value differs between server and
 * client," so there's no setState call inside an effect driving the swap
 * (the anti-pattern react-hooks/set-state-in-effect flags, and the reason
 * every provider in this app used to hydrate this way).
 *
 * The returned `ready` flag comes from the SAME useSyncExternalStore
 * snapshot as `value`, not a separately-resolving hook — two independent
 * useSyncExternalStore calls (e.g. this hook's value plus a standalone
 * useHasMounted()) aren't guaranteed to flip from their SSR default to their
 * real client value on the same render pass. A caller gating a write effect
 * on a `ready` sourced from a different hook can catch `ready === true`
 * while `value` is still momentarily the default, writing (and permanently
 * re-adopting) the default over real persisted data — a real bug this
 * shape exists to rule out, not just a style nicety.
 *
 * `merge` controls how parsed JSON combines with the default shape — the
 * default assumes a partial object to shallow-merge; pass a custom merge for
 * arrays or stricter validation. Any read/parse error falls back to
 * `defaultValue`, matching every provider's existing try/catch behavior.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  merge: (parsed: unknown, def: T) => T = (parsed, def) =>
    parsed && typeof parsed === "object" ? { ...def, ...parsed } : def,
): [T, (updater: T | ((prev: T) => T)) => void, boolean] {
  const cacheRef = React.useRef<{ raw: string | null; snapshot: Snapshot<T> } | null>(null);
  const listenersRef = React.useRef(new Set<() => void>());

  const getSnapshot = React.useCallback((): Snapshot<T> => {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      /* ignore */
    }
    if (cacheRef.current && cacheRef.current.raw === raw) return cacheRef.current.snapshot;
    let value = defaultValue;
    if (raw != null) {
      try {
        value = merge(JSON.parse(raw), defaultValue);
      } catch {
        value = defaultValue;
      }
    }
    const snapshot = { ready: true, value };
    cacheRef.current = { raw, snapshot };
    return snapshot;
  }, [key, defaultValue, merge]);

  const serverSnapshot = React.useMemo<Snapshot<T>>(() => ({ ready: false, value: defaultValue }), [defaultValue]);
  const getServerSnapshot = React.useCallback(() => serverSnapshot, [serverSnapshot]);

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      listenersRef.current.add(onStoreChange);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listenersRef.current.delete(onStoreChange);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );

  const { ready, value } = React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setValue = React.useCallback(
    (updater: T | ((prev: T) => T)) => {
      const current = cacheRef.current?.snapshot.value ?? defaultValue;
      const next = typeof updater === "function" ? (updater as (prev: T) => T)(current) : updater;
      const raw = JSON.stringify(next);
      try {
        localStorage.setItem(key, raw);
      } catch {
        /* ignore */
      }
      cacheRef.current = { raw, snapshot: { ready: true, value: next } };
      for (const l of listenersRef.current) l();
    },
    [key, defaultValue],
  );

  return [value, setValue, ready];
}

/**
 * True once past the client's hydration-matching first render — the
 * canonical useSyncExternalStore-based replacement for a manual
 * `useEffect(() => setMounted(true), [])`, for callers that need to gate UI
 * on "are we past SSR" without a setState-in-effect call, and that don't
 * also need it to resolve atomically with a useLocalStorageState value (see
 * that hook's own `ready` return for the case that does).
 */
export function useHasMounted(): boolean {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}
