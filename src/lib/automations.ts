"use client";
import * as React from "react";
import { useLocalStorageState } from "./useLocalStorageState";

const KEY = "zoqo-automations-v1";

/** A user-created (mocked) trading automation. There is no execution engine
 *  behind this — see AGENTS/CLAUDE notes on ZOQO's fully client-side mock
 *  backend. Creating one just persists a record locally, same spirit as the
 *  Poisson retail tape or the profile leaderboard: lightweight local state
 *  that makes the feature feel alive, not a dead mockup. */
export interface Automation {
  id: string;
  name: string;
  templateKey: string;
  category: string;
  rule: string;
  cooldownLabel: string;
  executionsLabel: string;
  enabled: boolean;
  createdAt: number;
}

interface StoredState {
  automations: Automation[];
}

const EMPTY_STATE: StoredState = { automations: [] };

function mergeAutomations(parsed: unknown, def: StoredState): StoredState {
  const p = parsed as Partial<StoredState> | null;
  return p && Array.isArray(p.automations) ? { automations: p.automations } : def;
}

function genId(): string {
  return `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Local, persisted list of mocked automations — useLocalStorageState reads
 *  once (SSR-safe) and writes on every change, no separate load/persist
 *  effects needed. */
export function useAutomations() {
  const [stored, setStored, ready] = useLocalStorageState(KEY, EMPTY_STATE, mergeAutomations);
  const automations = stored.automations;

  const setAutomations = React.useCallback(
    (updater: Automation[] | ((prev: Automation[]) => Automation[])) => {
      setStored((prev) => ({
        automations: typeof updater === "function" ? updater(prev.automations) : updater,
      }));
    },
    [setStored],
  );

  const create = React.useCallback(
    (input: Omit<Automation, "id" | "createdAt" | "enabled">) => {
      const automation: Automation = {
        ...input,
        id: genId(),
        enabled: true,
        createdAt: Date.now(),
      };
      setAutomations((prev) => [automation, ...prev]);
      return automation;
    },
    [setAutomations],
  );

  const toggle = React.useCallback(
    (id: string) => {
      setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
    },
    [setAutomations],
  );

  const remove = React.useCallback(
    (id: string) => {
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    },
    [setAutomations],
  );

  return { ready, automations, create, toggle, remove };
}
