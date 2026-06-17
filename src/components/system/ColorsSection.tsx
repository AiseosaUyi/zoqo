"use client";
import * as React from "react";
import { Check, Copy, RotateCcw } from "lucide-react";
import { PALETTE, SHADES, SURFACES, SEMANTIC, type ColorMeta } from "@/lib/tokens";
import { cn } from "@/lib/cn";
import { Section, Subhead } from "./primitives";
import { useCopy } from "./useCopy";
import { useTokenOverrides } from "./useTokenOverrides";

/** Pick readable text color for a given hex background. */
function readableOn(hex: string): string {
  const m = hex.replace("#", "");
  if (m.length < 6) return "#0e1113";
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0e1113" : "#ffffff";
}

function normalizeHex(v: string): string | null {
  let s = v.trim();
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const c = s.slice(1);
    return `#${c[0]}${c[0]}${c[1]}${c[1]}${c[2]}${c[2]}`.toLowerCase();
  }
  return null;
}

function Swatch({
  scaleKey,
  shade,
  defaultHex,
  override,
  onSet,
  onCopy,
  copied,
  isBase,
}: {
  scaleKey: string;
  shade: string;
  defaultHex: string;
  override?: string;
  onSet: (hex: string) => void;
  onCopy: (hex: string) => void;
  copied: boolean;
  isBase: boolean;
}) {
  const token = `${scaleKey}-${shade}`;
  const hex = override ?? defaultHex;
  const textColor = readableOn(hex);
  const [draft, setDraft] = React.useState(hex);

  React.useEffect(() => setDraft(hex), [hex]);

  const commit = (v: string) => {
    const n = normalizeHex(v);
    if (n) onSet(n);
    else setDraft(hex);
  };

  return (
    <div className="group flex w-full flex-col">
      <button
        type="button"
        onClick={() => onCopy(hex)}
        title={`Copy ${hex}`}
        className="relative flex h-16 w-full items-end justify-between rounded-[10px] px-2 py-1.5 transition-transform active:scale-[0.97]"
        style={{ backgroundColor: hex, color: textColor }}
      >
        <span className="text-[11px] font-bold opacity-90">{shade}</span>
        {isBase && (
          <span
            className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2"
            style={{ backgroundColor: textColor, boxShadow: `0 0 0 2px ${hex}` }}
            title="Base shade"
          />
        )}
        <span className="text-[10px] font-medium opacity-80">
          {copied ? <Check size={12} /> : <Copy size={11} className="opacity-0 transition-opacity group-hover:opacity-70" />}
        </span>
      </button>
      <div className="mt-1.5 flex items-center gap-1">
        <input
          type="color"
          value={normalizeHex(hex) ?? "#000000"}
          onChange={(e) => onSet(e.target.value)}
          aria-label={`Edit ${token}`}
          className="h-6 w-6 shrink-0 cursor-pointer rounded-[6px] border border-line-strong bg-surface p-0.5"
        />
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          spellCheck={false}
          className={cn(
            "nums w-full min-w-0 rounded-[6px] border border-line bg-surface px-1.5 py-1 text-[10.5px] font-medium text-ink outline-none focus:border-purple-400",
            override && "border-purple-300 text-purple-700",
          )}
        />
      </div>
    </div>
  );
}

function ScaleRow({
  meta,
  overrides,
  setToken,
  onCopy,
  copiedId,
}: {
  meta: ColorMeta;
  overrides: Record<string, string>;
  setToken: (token: string, hex: string) => void;
  onCopy: (hex: string, id: string) => void;
  copiedId: string | null;
}) {
  return (
    <div className="rounded-[16px] border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(14,17,19,0.04)]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h4 className="text-[15px] font-bold text-ink">{meta.label}</h4>
          <p className="mt-0.5 max-w-xl text-[12.5px] leading-snug text-sub">{meta.role}</p>
        </div>
        <code className="nums rounded-[6px] bg-muted px-2 py-1 text-[11px] text-sub">
          --color-{meta.key}-*
        </code>
      </div>
      <div className="grid grid-cols-10 gap-2">
        {SHADES.map((s) => {
          const token = `${meta.key}-${s}`;
          return (
            <Swatch
              key={s}
              scaleKey={meta.key}
              shade={s}
              defaultHex={meta.scale[s]}
              override={overrides[token]}
              onSet={(hex) => setToken(token, hex)}
              onCopy={(hex) => onCopy(hex, token)}
              copied={copiedId === token}
              isBase={meta.base === s}
            />
          );
        })}
      </div>
    </div>
  );
}

export function ColorsSection() {
  const { overrides, setToken, reset, count } = useTokenOverrides();
  const { copy, copied } = useCopy();

  return (
    <Section
      id="colors"
      eyebrow="Foundations"
      title="Colors"
      description={
        <>
          Ten-step ramps (50 to 900), Tailwind / Mantine style. Click any swatch to
          copy its hex. Edit a hex (text or color picker) to re-theme the entire app
          live — overrides are saved to your browser and re-applied on reload.
        </>
      }
    >
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[12px] border border-line bg-muted/60 px-4 py-3">
        <div className="text-[13px] text-sub">
          {count > 0 ? (
            <>
              <span className="font-semibold text-purple-700">{count}</span> token
              {count === 1 ? "" : "s"} overridden. Changes apply app-wide.
            </>
          ) : (
            <>No overrides — showing default tokens.</>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          disabled={count === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-[8px] border border-line-strong bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:pointer-events-none"
        >
          <RotateCcw size={13} />
          Reset to defaults
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {PALETTE.map((meta) => (
          <ScaleRow
            key={meta.key}
            meta={meta}
            overrides={overrides}
            setToken={setToken}
            onCopy={(hex, id) => copy(hex, id)}
            copiedId={copied}
          />
        ))}
      </div>

      <Subhead>Surfaces</Subhead>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {Object.entries(SURFACES).map(([k, hex]) => (
          <button
            key={k}
            type="button"
            onClick={() => copy(hex, `surface-${k}`)}
            className="flex flex-col overflow-hidden rounded-[12px] border border-line bg-surface text-left transition-transform active:scale-[0.98]"
          >
            <span className="h-12 w-full border-b border-line" style={{ backgroundColor: hex }} />
            <span className="px-2.5 py-2">
              <span className="block text-[12px] font-semibold text-ink">{k}</span>
              <span className="nums block text-[11px] text-sub">
                {copied === `surface-${k}` ? "Copied!" : hex}
              </span>
            </span>
          </button>
        ))}
      </div>

      <Subhead>Semantic aliases</Subhead>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(SEMANTIC).map(([name, value]) => (
          <button
            key={name}
            type="button"
            onClick={() => copy(value, `sem-${name}`)}
            className="flex items-center gap-3 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
          >
            <span
              className="h-6 w-6 shrink-0 rounded-[7px] border border-line-strong"
              style={{ background: value }}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] font-semibold text-ink">{name}</span>
              <span className="nums block truncate text-[11px] text-sub">
                {copied === `sem-${name}` ? "Copied!" : value}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}
