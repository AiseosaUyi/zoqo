"use client";
import * as React from "react";

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

function genId(): string {
  return `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Local, persisted list of mocked automations. Follows the same hydration
 *  idiom as ProfileProvider / ZoqoProvider: load once in an effect, write on
 *  every change, guard the first write with a ref so we never clobber
 *  localStorage with the empty initial state before hydration runs. */
export function useAutomations() {
  const [automations, setAutomations] = React.useState<Automation[]>([]);
  const [ready, setReady] = React.useState(false);
  const loaded = React.useRef(false);

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredState;
        if (Array.isArray(parsed.automations)) setAutomations(parsed.automations);
      }
    } catch {
      /* ignore corrupt/blocked storage */
    }
    loaded.current = true;
    setReady(true);
  }, []);

  React.useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ automations } satisfies StoredState));
    } catch {
      /* ignore quota/blocked storage */
    }
  }, [automations]);

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
    [],
  );

  const toggle = React.useCallback((id: string) => {
    setAutomations((prev) => prev.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
  }, []);

  const remove = React.useCallback((id: string) => {
    setAutomations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { ready, automations, create, toggle, remove };
}
