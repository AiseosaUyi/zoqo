import type { Position, OpenOrder, HistoryEntry } from "./types";
import type { PlayStats } from "./store";
import type { TerminalPosition, TerminalHistoryEntry } from "./terminalStore";
import type { Automation } from "./automations";

/** The backend abstraction (TERMINAL_SPEC.md §2, Phase B of the roadmap).
 *  One interface, two implementations — `dataStore.localStorage.ts` (today's
 *  exact behavior, Promise-wrapped) and `dataStore.remote.ts` (the live
 *  Supabase project, via the `/api/*` routes) — selected by `getDataStore()`
 *  in `getDataStore.ts` behind `NEXT_PUBLIC_BACKEND_ENABLED`.
 *
 *  Each provider (`store.tsx`, `terminalStore.tsx`, `profile.tsx`,
 *  `academy.ts`, `automations.ts`) still hydrates its DEFAULT (backend-
 *  disabled) path exactly as before, via `useLocalStorageState` directly —
 *  that path is unchanged, zero regression risk, since it's the same code
 *  that's been running all along. The remote path is additive: a
 *  `NEXT_PUBLIC_BACKEND_ENABLED`-gated effect that loads from
 *  `getDataStore()` and a `putX` call added to the existing persist effect.
 *  Deliberately not a full swap of the hydration mechanism — `store.tsx`
 *  carries scar tissue from a past async-resolution race that silently
 *  clobbered a user's real cash balance (see its `persistedWallet`/
 *  `walletLoaded` comment); rewiring that exact synchronous
 *  useSyncExternalStore-based hydration to route through an inherently
 *  async interface, for a flag that stays off until real auth + email
 *  delivery are configured, isn't a trade worth making blind (no browser
 *  access this session to verify it). The additive path is inert — and
 *  therefore risk-free to the app's current behavior — until the flag
 *  flips on. */

export interface WalletRecord {
  cash: number;
  depositCount: number;
  nextDepositAt: number;
  stats: PlayStats;
  positions: Position[];
  tradeHistory: HistoryEntry[];
  openOrders: OpenOrder[]; // userPlaced only, same subset store.tsx persists today
}

export interface TerminalRecord {
  positions: TerminalPosition[];
  history: TerminalHistoryEntry[];
}

export interface ProfileRecord {
  handle: string | null;
  email: string | null;
  avatarSeed: string;
  streak: number;
  bestStreak: number;
  lastClaimDay: string | null;
  claims: number;
  createdAt: number;
}

export interface AcademyRecord {
  xp: number;
  hearts: number;
  lastHeartLostAt: number;
  streak: number;
  lastLessonDay: string | null;
  completedLessons: string[];
}

/** Extends `Automation` (src/lib/automations.ts — `maxOrderSize`/`dailyCap`
 *  already live on the automation itself, the server-enforced ceiling
 *  regardless of what created the trigger: a human in the UI, or the MCP
 *  server's `create_automation_trigger` — spec §7) with evaluator-written
 *  state. `lastTriggeredAt`/`spentToday`/`executionsCount` are not user
 *  config — kept logically separate (a distinct `automation_triggers` table
 *  in the schema) so the Cron evaluator's writes never race a user editing
 *  name/condition/enabled. */
export interface AutomationRecord extends Automation {
  lastTriggeredAt?: number;
  spentToday?: number;
  spentTodayResetAt?: number;
  executionsCount?: number;
}

export interface LocalStorageSnapshot {
  wallet: WalletRecord | null;
  terminal: TerminalRecord | null;
  profile: ProfileRecord | null;
  academy: AcademyRecord | null;
  automations: AutomationRecord[];
}

export interface DataStore {
  /** Scopes every call below to the signed-in user server-side (session
   *  cookie) — never passed explicitly by callers, so no call site can
   *  accidentally read/write someone else's row. Null = signed out. */
  getUserId(): Promise<string | null>;

  getWallet(): Promise<WalletRecord | null>;
  putWallet(record: WalletRecord): Promise<void>;

  getTerminal(): Promise<TerminalRecord | null>;
  putTerminal(record: TerminalRecord): Promise<void>;

  getProfile(): Promise<ProfileRecord | null>;
  putProfile(record: ProfileRecord): Promise<void>;

  getAcademy(): Promise<AcademyRecord | null>;
  putAcademy(record: AcademyRecord): Promise<void>;

  listAutomations(): Promise<AutomationRecord[]>;
  createAutomation(
    input: Omit<AutomationRecord, "id" | "createdAt" | "enabled">,
  ): Promise<AutomationRecord>;
  updateAutomation(id: string, patch: Partial<AutomationRecord>): Promise<void>;
  removeAutomation(id: string): Promise<void>;

  /** One-shot import of whatever's in the browser's legacy localStorage
   *  keys, called on first real sign-in (see the plan's migration-on-
   *  first-login step). Implementations must be idempotent — safe to call
   *  more than once for the same user without double-crediting cash. */
  migrateFromLocalStorage(snapshot: LocalStorageSnapshot): Promise<void>;
}
