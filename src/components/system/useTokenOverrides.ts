"use client";
import * as React from "react";

const STORAGE_KEY = "zoqo-token-overrides";

type Overrides = Record<string, string>; // "purple-500" -> "#601fff"

function readStored(): Overrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Overrides) : {};
  } catch {
    return {};
  }
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
  const [overrides, setOverrides] = React.useState<Overrides>({});

  // Re-apply persisted overrides on mount.
  React.useEffect(() => {
    const stored = readStored();
    setOverrides(stored);
    for (const [token, hex] of Object.entries(stored)) applyVar(token, hex);
  }, []);

  const setToken = React.useCallback((token: string, hex: string) => {
    applyVar(token, hex);
    setOverrides((prev) => {
      const next = { ...prev, [token]: hex };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const reset = React.useCallback(() => {
    setOverrides((prev) => {
      for (const token of Object.keys(prev)) clearVar(token);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      return {};
    });
  }, []);

  const count = Object.keys(overrides).length;

  return { overrides, setToken, reset, count };
}
