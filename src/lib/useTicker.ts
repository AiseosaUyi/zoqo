"use client";
import * as React from "react";

/**
 * Re-renders every `intervalMs`, returning the wall-clock time as of the
 * last tick (0 during SSR / the client's hydration-matching first render).
 * useSyncExternalStore-based so the periodic update comes from React's own
 * subscription mechanism instead of a setState call inside a useEffect body.
 */
export function useTicker(intervalMs: number): number {
  const tickRef = React.useRef(0);

  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      tickRef.current = Date.now();
      const id = setInterval(() => {
        tickRef.current = Date.now();
        onStoreChange();
      }, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs],
  );
  const getSnapshot = React.useCallback(() => tickRef.current, []);
  const getServerSnapshot = React.useCallback(() => 0, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
