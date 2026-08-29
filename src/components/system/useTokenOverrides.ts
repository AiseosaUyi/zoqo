"use client";
import * as React from "react";
import { useLocalStorageState } from "@/lib/useLocalStorageState";

const STORAGE_KEY = "zoqo-token-overrides";

type Overrides = Record<string, string>; // "purple-500" -> "#601fff"

const EMPTY_OVERRIDES: Overrides = {};

function mergeOverrides(parsed: unknown): Overrides {
  return parsed && typeof parsed === "object" ? (parsed as Overrides) : EMPTY_OVERRIDES;
}

function applyVar(token: string, hex: string) {
  document.documentElement.style.setProperty(`--color-${token}`, hex);
}

function clearVar(token: string) {
  document.documentElement.style.removeProperty(`--color-${token}`);
}

/**
 * Live-editable color tokens. Writes overrides as inline CSS custom
 * properties on <html> (re-theming the whole app) and persists them to
 * localStorage so they survive reloads.
 */
export function useTokenOverrides() {
  const [overrides, setOverrides] = useLocalStorageState(STORAGE_KEY, EMPTY_OVERRIDES, mergeOverrides);
  const appliedRef = React.useRef<Overrides>({});

  // Reconcile the DOM with whatever `overrides` currently is (persisted
  // value on first paint after hydration, or a live edit after that) — a
  // pure DOM side effect, not a state update, so it's not the pattern
  // react-hooks/set-state-in-effect flags.
  React.useEffect(() => {
    const applied = appliedRef.current;
    for (const token of Object.keys(applied)) {
      if (!(token in overrides)) clearVar(token);
    }
    for (const [token, hex] of Object.entries(overrides)) applyVar(token, hex);
    appliedRef.current = overrides;
  }, [overrides]);

  const setToken = React.useCallback(
    (token: string, hex: string) => {
      setOverrides((prev) => ({ ...prev, [token]: hex }));
    },
    [setOverrides],
  );

  const reset = React.useCallback(() => {
    setOverrides(EMPTY_OVERRIDES);
  }, [setOverrides]);

  const count = Object.keys(overrides).length;

  return { overrides, setToken, reset, count };
}
