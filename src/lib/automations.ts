"use client";
import * as React from "react";
import { useLocalStorageState } from "./useLocalStorageState";
import { BACKEND_ENABLED, getDataStore } from "./getDataStore";
import { useProfile } from "./profile";
import { describeAutomation, type AutomationCondition, type AutomationAction } from "./automationRules";

export { describeAutomation };
export type { AutomationCondition, AutomationAction };

const KEY = "zoqo-automations-v1";

/** A user-created trading automation for the multi-asset Terminal
 *  (src/lib/terminalStore.tsx). Real execution lives server-side —
 *  src/app/api/cron/evaluate-triggers/route.ts evaluates `condition` against
 *  live/self-built price history once a minute and, on a hit, places an
 *  order through the same order-execution path a human's Buy click uses
 *  (src/lib/orderExecution.ts) — see PHASE_C_HANDOFF.md's C1/C2. The default
 *  (backend-disabled) localStorage path still just persists the record —
 *  there's no evaluator that can reach localStorage, so an automation only
 *  actually fires once signed in with the backend enabled. */
export interface Automation {
  id: string;
  name: string;
  templateKey: string;
  category: string;
  symbol: string; // AssetDef.id, src/lib/assets.ts
  condition: AutomationCondition;
  action: AutomationAction;
  maxOrderSize: number;
  dailyCap: number;
  rule: string; // generated display sentence, computed once at create/update time
  enabled: boolean;
  createdAt: number;
  /** Real fire count, written by the cron evaluator — only ever populated
   *  once overlaid from the backend (src/lib/dataStore.ts's AutomationRecord);
   *  undefined for a purely local (backend-disabled) automation, which
   *  nothing ever executes. */
  executionsCount?: number;
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

/** Local, persisted list of automations — useLocalStorageState reads once
 *  (SSR-safe) and writes on every change, no separate load/persist effects
 *  needed. Once signed in with the backend enabled, this overlays the real
 *  Postgres-backed list once (same pattern as terminalStore.tsx/academy.ts)
 *  and every create/toggle/remove also calls the matching real CRUD method
 *  (src/lib/dataStore.remote.ts) — automations are per-id CRUD, not a
 *  whole-blob PUT like the wallet/terminal, so each action hits its own
 *  endpoint directly rather than a single watch-and-push effect. */
export function useAutomations() {
  const [stored, setStored, ready] = useLocalStorageState(KEY, EMPTY_STATE, mergeAutomations);
  const automations = stored.automations;
  const { signedIn } = useProfile();

  const setAutomations = React.useCallback(
    (updater: Automation[] | ((prev: Automation[]) => Automation[])) => {
      setStored((prev) => ({
        automations: typeof updater === "function" ? updater(prev.automations) : updater,
      }));
    },
    [setStored],
  );

  const remoteAppliedRef = React.useRef(false);
  React.useEffect(() => {
    if (!BACKEND_ENABLED || !signedIn || remoteAppliedRef.current) return;
    remoteAppliedRef.current = true;
    getDataStore()
      .listAutomations()
      .then((remote) => {
        if (remote.length) setAutomations(remote);
      });
  }, [signedIn, setAutomations]);

  const create = React.useCallback(
    (input: Omit<Automation, "id" | "createdAt" | "enabled">) => {
      const automation: Automation = {
        ...input,
        id: genId(),
        enabled: true,
        createdAt: Date.now(),
      };
      setAutomations((prev) => [automation, ...prev]);
      if (BACKEND_ENABLED && signedIn) {
        void getDataStore()
          .createAutomation(input)
          .then((record) => {
            setAutomations((prev) => prev.map((a) => (a.id === automation.id ? record : a)));
          });
      }
      return automation;
    },
    [setAutomations, signedIn],
  );

  const toggle = React.useCallback(
    (id: string) => {
      let nextEnabled = false;
      setAutomations((prev) =>
        prev.map((a) => {
          if (a.id !== id) return a;
          nextEnabled = !a.enabled;
          return { ...a, enabled: nextEnabled };
        }),
      );
      if (BACKEND_ENABLED && signedIn) void getDataStore().updateAutomation(id, { enabled: nextEnabled });
    },
    [setAutomations, signedIn],
  );

  const remove = React.useCallback(
    (id: string) => {
      setAutomations((prev) => prev.filter((a) => a.id !== id));
      if (BACKEND_ENABLED && signedIn) void getDataStore().removeAutomation(id);
    },
    [setAutomations, signedIn],
  );

  return { ready, automations, create, toggle, remove };
}
