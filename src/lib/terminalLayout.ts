"use client";
// Persistence for the desktop panel system's state that react-resizable-
// panels doesn't own itself: which panels are closed, and each row's panel
// order (drag-to-reorder). Panel *sizes* — including collapsed size — are
// persisted separately via that library's own `useDefaultLayout` (keyed by
// panel id, defaults to localStorage) inside TerminalPanel/TerminalShell.
import { useLocalStorageState } from "./useLocalStorageState";

const HIDDEN_KEY = "zoqo-terminal-hidden-panels-v1";
const ORDER_KEY = "zoqo-terminal-row1-order-v1";

/** react-resizable-panels' `useDefaultLayout` defaults its `storage` param
 *  to the bare `localStorage` global, evaluated eagerly — that throws
 *  during SSR (Node has no `localStorage`), which otherwise forces the
 *  whole terminal into an SSR-error client-render fallback. Pass this
 *  no-op-on-the-server shim as that hook's `storage` prop everywhere it's
 *  used instead of leaving the default in place. */
export const ssrSafeLayoutStorage = {
  getItem: (key: string) => (typeof window === "undefined" ? null : window.localStorage.getItem(key)),
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  },
};

const mergeArray = <T,>(parsed: unknown, def: T[]): T[] => (Array.isArray(parsed) ? (parsed as T[]) : def);

export function useHiddenPanels() {
  const [hidden, setHidden] = useLocalStorageState<string[]>(HIDDEN_KEY, [], mergeArray);
  const isHidden = (id: string) => hidden.includes(id);
  const hide = (id: string) => setHidden((prev) => (prev.includes(id) ? prev : [...prev, id]));
  const show = (id: string) => setHidden((prev) => prev.filter((x) => x !== id));
  return { hidden, isHidden, hide, show };
}

/** Row 1's panel order (Watchlist/Chart/Order Book/Trade Form), reorderable
 *  by dragging a panel's header onto another. `defaultOrder` seeds first use
 *  and back-fills any panel id introduced after a user already saved an
 *  order (so a future 6th panel doesn't just vanish for existing users). */
export function useRowOrder(defaultOrder: string[]) {
  const [order, setOrder] = useLocalStorageState<string[]>(ORDER_KEY, defaultOrder, mergeArray);
  const known = order.filter((id) => defaultOrder.includes(id));
  const missing = defaultOrder.filter((id) => !known.includes(id));
  const effective = [...known, ...missing];

  const moveBefore = (dragId: string, dropId: string) => {
    if (dragId === dropId) return;
    setOrder((prev) => {
      const base = prev.filter((id) => defaultOrder.includes(id));
      for (const id of defaultOrder) if (!base.includes(id)) base.push(id);
      const without = base.filter((id) => id !== dragId);
      const dropIdx = without.indexOf(dropId);
      without.splice(dropIdx, 0, dragId);
      return without;
    });
  };

  return { order: effective, moveBefore };
}
