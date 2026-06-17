"use client";
import * as React from "react";
import { RADII, SPACING } from "@/lib/tokens";
import { Section, Subhead } from "./primitives";
import { useCopy } from "./useCopy";

export function TokensSection() {
  const { copy, copied } = useCopy();

  return (
    <Section
      id="tokens"
      eyebrow="Foundations"
      title="Tokens"
      description="Radii and spacing — the structural primitives that give ZOQO its rounded, generously-spaced feel. (Shadows live in their own Elevation section.) Click any token to copy its value."
    >
      <Subhead>Radii</Subhead>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Object.entries(RADII).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => copy(v, `radius-${k}`)}
            className="flex flex-col items-center gap-3 rounded-[14px] border border-line bg-surface p-4 transition-colors hover:bg-gray-50"
          >
            <div
              className="h-16 w-16 border-2 border-purple-300 bg-purple-50"
              style={{ borderRadius: v }}
            />
            <div className="text-center">
              <div className="text-[12.5px] font-semibold text-ink">{k}</div>
              <div className="nums text-[11px] text-sub">
                {copied === `radius-${k}` ? "Copied!" : v}
              </div>
            </div>
          </button>
        ))}
      </div>

      <Subhead>Spacing</Subhead>
      <div className="flex flex-col gap-2 rounded-[16px] border border-line bg-surface p-5">
        {Object.entries(SPACING).map(([k, v]) => (
          <button
            key={k}
            type="button"
            onClick={() => copy(v, `space-${k}`)}
            className="flex items-center gap-4 rounded-[8px] px-2 py-1 transition-colors hover:bg-gray-50"
          >
            <span className="w-6 shrink-0 text-left text-[12.5px] font-semibold text-ink">{k}</span>
            <span className="nums w-14 shrink-0 text-left text-[11px] text-sub">
              {copied === `space-${k}` ? "Copied!" : v}
            </span>
            <span className="h-3.5 rounded-[3px] bg-purple-400" style={{ width: v }} />
          </button>
        ))}
      </div>
    </Section>
  );
}
