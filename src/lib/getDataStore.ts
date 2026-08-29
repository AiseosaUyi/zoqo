import type { DataStore } from "./dataStore";
import { localDataStore } from "./dataStore.localStorage";
import { remoteDataStore } from "./dataStore.remote";

/** Picks the DataStore implementation — kept out of dataStore.ts itself to
 *  avoid that file importing both implementations, which each import types
 *  back from it (an avoidable circular import for no benefit). */
export function getDataStore(): DataStore {
  return process.env.NEXT_PUBLIC_BACKEND_ENABLED === "1" ? remoteDataStore : localDataStore;
}

/** Read once, at module scope — this flag can't change without a rebuild
 *  (it's a build-time env var, not something toggled at runtime), so
 *  providers gating an effect on it don't need to re-read it every render. */
export const BACKEND_ENABLED = process.env.NEXT_PUBLIC_BACKEND_ENABLED === "1";
