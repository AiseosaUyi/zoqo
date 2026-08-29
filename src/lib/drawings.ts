import type { SerializedDrawing } from "lightweight-charts-drawing";

/** Per-asset chart drawings (trend lines, Fibonacci, pins — TERMINAL_SPEC.md
 *  §4). Plain localStorage get/set, not `useLocalStorageState` — drawings
 *  live inside `lightweight-charts-drawing`'s own imperative `DrawingManager`
 *  (a canvas primitive, not React state), so there's no React render loop to
 *  drive here; TerminalChart just loads on asset switch and saves on the
 *  manager's own change events. */

const KEY = "zoqo-drawings-v1";

type DrawingsByAsset = Record<string, SerializedDrawing[]>;

function readAll(): DrawingsByAsset {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function getDrawings(assetId: string): SerializedDrawing[] {
  return readAll()[assetId] ?? [];
}

export function setDrawings(assetId: string, drawings: SerializedDrawing[]) {
  try {
    const all = readAll();
    if (drawings.length === 0) delete all[assetId];
    else all[assetId] = drawings;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // ignore — drawings just won't persist across reloads this session
  }
}
