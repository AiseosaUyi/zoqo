import type { Position, OpenOrder, HistoryEntry } from "./types";
import type { PlayStats } from "./store";
import type { TerminalPosition, TerminalHistoryEntry } from "./terminalStore";
import type { Automation } from "./automations";

/** The backend abstraction (TERMINAL_SPEC.md §2, Phase B of the roadmap).
 *  One interface, two eventual implementations: a Postgres-backed one
 *  (`dataStore.remote.ts`, built once a live Supabase project exists — see
 *  the plan) and a localStorage-backed one matching today's exact behavior.
 *
 *  Deliberately NOT wired into `store.tsx`/`terminalStore.tsx`/`profile.tsx`/
 *  `academy.ts` yet, and `dataStore.localStorage.ts` isn't built yet either
 *  — both are premature right now. Those providers hydrate via
 *  `useLocalStorageState`'s useSyncExternalStore pattern specifically
 *  because it resolves the persisted value *synchronously* on the client's
 *  first real render; this interface's methods are `Promise`-returning
 *  because a real remote store genuinely can't do better than that. There
 *  is no way to satisfy both a synchronous consumer and this async
 *  interface without either introducing a loading-state render pass into
 *  currently-instant hydration, or re-deriving a synchronous "cache" layer
 *  in front of it — real work that has no payoff until there's an actual
 *  remote implementation to justify it. `store.tsx` itself carries scar
 *  tissue from a past async-resolution race that silently clobbered a
 *  user's real cash balance (see its `persistedWallet`/`walletLoaded`
 *  comment) — rewiring that exact code path ahead of need, for a backend
 *  that doesn't exist yet, is the wrong tradeoff. Once a live Supabase
 *  project exists, build `dataStore.remote.ts` against this interface,
 *  design the synchronous-cache-plus-async-sync hook each provider needs
 *  (`useDataStoreState`, replacing `useLocalStorageState` call-sites one
 *  provider at a time per the plan), and only then does building
 *  `dataStore.localStorage.ts` (the interface-shaped wrapper the remote
 *  impl's offline-cache mirror writes through to) earn its place. */

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

/** Extends today's (cosmetic, CRUD-only) `Automation` with the fields the
 *  Phase C trigger engine needs from day one — `maxOrderSize`/`dailyCap` are
 *  the server-enforced ceiling regardless of what created the trigger (a
 *  human in the UI, or the future MCP server's `create_automation_trigger`
 *  — spec §7). `lastTriggeredAt`/`spentToday` are evaluator-written state,
 *  not user config — kept logically separate (a distinct `automation_triggers`
 *  table in the schema) so the Cron evaluator's writes never race a user
 *  editing name/rule/enabled. */
export interface AutomationRecord extends Automation {
  maxOrderSize: number;
  dailyCap: number;
  lastTriggeredAt?: number;
  spentToday?: number;
  spentTodayResetAt?: number;
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
