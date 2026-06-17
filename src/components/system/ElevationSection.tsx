"use client";
import * as React from "react";
import { SHADOWS } from "@/lib/tokens";
import { Section, Subhead } from "./primitives";
import { useCopy } from "./useCopy";

const RISING = ["e1", "e2", "e3", "e4", "e5"] as const;
const GLOWS = ["brand", "up", "down"] as const;

function ShadowCard({
  name,
  value,
  copied,
  onCopy,
  tinted,
}: {
  name: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  tinted?: "brand" | "up" | "down";
}) {
  const swatch =
    tinted === "brand"
      ? "bg-purple-500 text-white"
      : tinted === "up"
        ? "bg-green-500 text-white"
        : tinted === "down"
          ? "bg-red-500 text-white"
          : "bg-surface text-ink";
  return (
    <button
      type="button"
      onClick={onCopy}
      className="group flex flex-col items-stretch gap-3 text-left"
    >
      <div
        className={`flex h-24 items-center justify-center rounded-[14px] text-[13px] font-bold transition-transform duration-200 group-hover:-translate-y-0.5 ${swatch}`}
        style={{ boxShadow: value }}
      >
        shadow-{name}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <code className="text-[12px] font-semibold text-ink">--shadow-{name}</code>
        <span className="text-[11px] font-medium text-purple-600 opacity-0 transition-opacity group-hover:opacity-100">
          {copied ? "Copied!" : "Click to copy"}
        </span>
      </div>
      <code className="nums truncate text-[10.5px] leading-relaxed text-sub">{value}</code>
    </button>
  );
}

export function ElevationSection() {
  const { copy, copied } = useCopy();

  return (
    <Section
      id="elevation"
      eyebrow="Foundations"
      title="Elevation"
      description="A layered shadow scale — each level stacks a tight contact shadow with a wider ambient one, tinted with the warm ink. e1→e5 rise off the page; brand / up / down are colored glows for CTAs and directional states. Click any card to copy its value."
    >
      <Subhead>Rising elevation</Subhead>
      <div className="grid grid-cols-1 gap-6 rounded-[16px] border border-line bg-muted/40 p-7 sm:grid-cols-2 lg:grid-cols-5">
        {RISING.map((k) => (
          <ShadowCard
            key={k}
            name={k}
            value={SHADOWS[k]}
            copied={copied === `shadow-${k}`}
            onCopy={() => copy(SHADOWS[k], `shadow-${k}`)}
          />
        ))}
      </div>

      <Subhead>Colored glows</Subhead>
      <div className="grid grid-cols-1 gap-6 rounded-[16px] border border-line bg-muted/40 p-7 sm:grid-cols-3">
        {GLOWS.map((k) => (
          <ShadowCard
            key={k}
            name={k}
            value={SHADOWS[k]}
            copied={copied === `shadow-${k}`}
            onCopy={() => copy(SHADOWS[k], `shadow-${k}`)}
            tinted={k}
          />
        ))}
      </div>
    </Section>
  );
}
