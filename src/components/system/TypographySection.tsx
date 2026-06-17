"use client";
import * as React from "react";
import { FONTS, TYPE_SCALE, type TypeToken } from "@/lib/tokens";
import { Section, Subhead } from "./primitives";

const FONT_FAMILY: Record<TypeToken["font"], string> = {
  Inter: "var(--font-sans)",
  "Bebas Neue": "var(--font-bebas)",
};

const FONT_COLOR: Record<TypeToken["font"], string> = {
  Inter: "bg-purple-50 text-purple-700",
  "Bebas Neue": "bg-orange-50 text-orange-700",
};

const textTokens = TYPE_SCALE.filter(t => !t.key.startsWith("num-"));
const numTokens  = TYPE_SCALE.filter(t =>  t.key.startsWith("num-"));

function TypeRow({ t }: { t: TypeToken }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line px-5 py-5 last:border-0">
      <div className="flex items-start justify-between gap-4">
        {/* Live preview */}
        <div
          className="flex-1 min-w-0 text-ink"
          style={{
            fontFamily: FONT_FAMILY[t.font],
            fontSize: `${Math.min(t.size, 56)}px`,
            fontWeight: t.weight,
            lineHeight: t.lineHeight,
            letterSpacing: t.tracking,
          }}
        >
          {t.sample}
        </div>

        {/* Meta */}
        <div className="flex shrink-0 flex-col items-end gap-1 pt-1">
          <span className="text-[13px] font-semibold text-ink">{t.label}</span>
          <span className={`rounded-[5px] px-1.5 py-0.5 text-[10px] font-semibold ${FONT_COLOR[t.font]}`}>
            {t.font}
          </span>
          <span className="nums text-[11px] text-sub">
            {t.size}px · {t.weight}
            {t.tracking ? ` · ${t.tracking}` : ""}
          </span>
        </div>
      </div>

      {/* Use case */}
      <p className="text-[12px] text-sub leading-relaxed">{t.useCase}</p>
    </div>
  );
}

export function TypographySection() {
  return (
    <Section
      id="typography"
      eyebrow="Foundations"
      title="Typography"
      description="Two fonts, clear rules. Inter for all interface text. Bebas Neue for numeric data only."
    >
      {/* Font families */}
      <Subhead>Font families</Subhead>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FONTS.map((f) => (
          <div key={f.key} className="rounded-[14px] border border-line bg-surface p-5">
            <div
              className="text-[52px] leading-none text-ink"
              style={{ fontFamily: f.cssVar, fontWeight: f.key === "inter" ? 700 : 400 }}
            >
              {f.key === "inter" ? "Ag" : "42"}
            </div>
            <div className="mt-4 text-[13px] font-semibold text-ink">{f.label}</div>
            <div className="mt-1 text-[12px] text-sub">{f.role}</div>
            <code className="mt-3 block text-[10px] text-gray-400 font-mono">{f.cssVar}</code>
          </div>
        ))}
      </div>

      {/* Text scale */}
      <Subhead>Text — Inter</Subhead>
      <div className="rounded-[16px] border border-line bg-surface overflow-hidden">
        {textTokens.map(t => <TypeRow key={t.key} t={t} />)}
      </div>

      {/* Numeric scale */}
      <Subhead>Numbers — Bebas Neue only</Subhead>
      <p className="text-[13px] text-sub -mt-3">
        Use exclusively for prices, amounts, balances, percentages, and counts. Never for prose or labels.
      </p>
      <div className="rounded-[16px] border border-line bg-surface overflow-hidden">
        {numTokens.map(t => <TypeRow key={t.key} t={t} />)}
      </div>

      {/* Dev callout */}
      <div className="rounded-[12px] border border-purple-200 bg-purple-50 p-5">
        <p className="text-[12px] font-semibold text-purple-900 mb-2">Developer usage</p>
        <code className="block rounded-[8px] bg-white border border-purple-100 px-4 py-3 text-[11px] font-mono text-ink leading-relaxed whitespace-pre">
{`<h1 class="text-h1">Heading</h1>
<p  class="text-body-2">Body text</p>
<span class="text-label">Label</span>
<span class="text-num-1">$45,230.89</span>`}
        </code>
        <p className="mt-2 text-[11px] text-purple-700">
          Class names map 1:1 to token keys: <code className="bg-white px-1 rounded text-purple-800 font-mono">.text-h1</code>, <code className="bg-white px-1 rounded text-purple-800 font-mono">.text-body-2</code>, <code className="bg-white px-1 rounded text-purple-800 font-mono">.text-num-3</code>, etc.
        </p>
      </div>
    </Section>
  );
}
