"use client";
import type {
  DataStore,
  WalletRecord,
  TerminalRecord,
  ProfileRecord,
  AcademyRecord,
  AutomationRecord,
  LocalStorageSnapshot,
} from "./dataStore";

/** Postgres-backed DataStore (src/lib/dataStore.ts), calling the /api/*
 *  routes rather than talking to Supabase directly from the client — those
 *  routes are the single place RLS + the session cookie get enforced, per
 *  dataStore.ts's own "every call is implicitly scoped by the
 *  implementation" contract. A 401 (signed out) resolves to `null` for
 *  reads rather than throwing, matching getUserId()'s "null = signed out"
 *  semantics — callers already treat a null record as "nothing persisted
 *  yet" for the localStorage impl, so this reuses the same shape instead of
 *  needing a separate signed-out branch everywhere. */

async function apiGet<T>(path: string): Promise<T | null> {
  const res = await fetch(path);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiWrite(path: string, method: "PUT" | "POST" | "PATCH" | "DELETE", body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) return; // signed out — nothing to persist to
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
}

export const remoteDataStore: DataStore = {
  async getUserId() {
    // Auth identity lives in Supabase's own session (src/lib/supabase/client.ts),
    // not duplicated here — this store only ever needs "am I scoped to a
    // user," which every route already answers server-side via the cookie.
    return null;
  },

  getWallet: () => apiGet<WalletRecord>("/api/wallet"),
  putWallet: (record) => apiWrite("/api/wallet", "PUT", record),

  getTerminal: () => apiGet<TerminalRecord>("/api/terminal"),
  putTerminal: (record) => apiWrite("/api/terminal", "PUT", record),

  getProfile: () => apiGet<ProfileRecord>("/api/profile"),
  putProfile: (record) => apiWrite("/api/profile", "PUT", record),

  getAcademy: () => apiGet<AcademyRecord>("/api/academy"),
  putAcademy: (record) => apiWrite("/api/academy", "PUT", record),

  listAutomations: async () => (await apiGet<AutomationRecord[]>("/api/automations")) ?? [],
  createAutomation: async (input) => {
    const res = await fetch("/api/automations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`POST /api/automations failed: ${res.status}`);
    return res.json();
  },
  updateAutomation: (id, patch) => apiWrite(`/api/automations/${id}`, "PATCH", patch),
  removeAutomation: (id) => apiWrite(`/api/automations/${id}`, "DELETE"),

  migrateFromLocalStorage: (snapshot: LocalStorageSnapshot) => apiWrite("/api/migrate", "POST", snapshot),
};
