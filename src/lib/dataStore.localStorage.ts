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

/** localStorage-backed DataStore — today's actual behavior (the same keys
 *  store.tsx/terminalStore.tsx/profile.tsx/academy.ts/automations.ts have
 *  always used), wrapped to satisfy the async `DataStore` interface so it's
 *  a drop-in alternative to dataStore.remote.ts behind the
 *  NEXT_PUBLIC_BACKEND_ENABLED flag. Not currently wired into any
 *  provider's default hydration path — those keep using
 *  `useLocalStorageState` directly, unchanged, since that's already
 *  exactly this behavior with zero risk of regression. This exists so
 *  `getDataStore()` has a real fallback and so the interface has two actual
 *  implementations, not one design doc and one stub. */

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

const WALLET_KEY = "zoqo-wallet-v2";
const TERMINAL_POSITIONS_KEY = "zoqo-terminal-positions-v1";
const TERMINAL_HISTORY_KEY = "zoqo-terminal-history-v1";
const PROFILE_KEY = "zoqo-profile-v1";
const ACADEMY_KEY = "zoqo-academy-v1";
const AUTOMATIONS_KEY = "zoqo-automations-v1";

export const localDataStore: DataStore = {
  async getUserId() {
    return "local"; // sentinel — there's no real session in local mode
  },

  async getWallet() {
    return read<WalletRecord>(WALLET_KEY);
  },
  async putWallet(record) {
    write(WALLET_KEY, record);
  },

  async getTerminal() {
    const positions = read<TerminalRecord["positions"]>(TERMINAL_POSITIONS_KEY) ?? [];
    const history = read<TerminalRecord["history"]>(TERMINAL_HISTORY_KEY) ?? [];
    return { positions, history };
  },
  async putTerminal(record) {
    write(TERMINAL_POSITIONS_KEY, record.positions);
    write(TERMINAL_HISTORY_KEY, record.history);
  },

  async getProfile() {
    return read<ProfileRecord>(PROFILE_KEY);
  },
  async putProfile(record) {
    write(PROFILE_KEY, record);
  },

  async getAcademy() {
    return read<AcademyRecord>(ACADEMY_KEY);
  },
  async putAcademy(record) {
    write(ACADEMY_KEY, record);
  },

  async listAutomations() {
    return read<{ automations: AutomationRecord[] }>(AUTOMATIONS_KEY)?.automations ?? [];
  },
  async createAutomation(input) {
    const automations = await localDataStore.listAutomations();
    const record: AutomationRecord = { ...input, id: `auto_${Date.now().toString(36)}`, enabled: true, createdAt: Date.now() };
    write(AUTOMATIONS_KEY, { automations: [record, ...automations] });
    return record;
  },
  async updateAutomation(id, patch) {
    const automations = await localDataStore.listAutomations();
    write(AUTOMATIONS_KEY, { automations: automations.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  },
  async removeAutomation(id) {
    const automations = await localDataStore.listAutomations();
    write(AUTOMATIONS_KEY, { automations: automations.filter((a) => a.id !== id) });
  },

  async migrateFromLocalStorage() {
    // No-op — migration only makes sense when moving *into* a remote store.
  },
};

/** Reads the browser's legacy localStorage keys directly (bypassing
 *  DataStore's own async reads, which would just read the same keys back —
 *  this is the actual bytes on the client's first real sign-in) into the
 *  shape /api/migrate expects. Used by profile.tsx once real auth lands.
 *
 *  Automations are deliberately excluded: today's client-side `Automation`
 *  shape predates `maxOrderSize`/`dailyCap` (added for the Phase C trigger
 *  engine — see dataStore.ts's AutomationRecord comment), and those columns
 *  are NOT NULL in the schema. A pre-existing local automation migrated
 *  as-is would fail the insert; since automations are cosmetic mocks with
 *  no real execution behind them yet, losing them on migration is the safe
 *  choice, not a real one worth backfilling defaults for. */
export function collectLocalStorageSnapshot(): LocalStorageSnapshot {
  return {
    wallet: read<WalletRecord>(WALLET_KEY),
    terminal: {
      positions: read<TerminalRecord["positions"]>(TERMINAL_POSITIONS_KEY) ?? [],
      history: read<TerminalRecord["history"]>(TERMINAL_HISTORY_KEY) ?? [],
    },
    profile: read<ProfileRecord>(PROFILE_KEY),
    academy: read<AcademyRecord>(ACADEMY_KEY),
    automations: [],
  };
}
