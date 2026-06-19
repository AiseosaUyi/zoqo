"use client";
import * as React from "react";
import Link from "next/link";
import { Palette, Type, Box, Component, Download, Sparkles, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui";
import { PALETTE, TYPE_SCALE } from "@/lib/tokens";
import { Sidebar, type NavItem } from "./Sidebar";
import { Section } from "./primitives";
import { ColorsSection } from "./ColorsSection";
import { TypographySection } from "./TypographySection";
import { TokensSection } from "./TokensSection";
import { ElevationSection } from "./ElevationSection";
import { LoadingSection } from "./LoadingSection";
import { ComponentsSection } from "./ComponentsSection";
import { ExportSection } from "./ExportSection";

const NAV: NavItem[] = [
  { id: "overview", label: "Overview" },
  { id: "colors", label: "Colors" },
  { id: "typography", label: "Typography" },
  { id: "tokens", label: "Tokens" },
  { id: "elevation", label: "Elevation" },
  { id: "loading", label: "Loading" },
  { id: "components", label: "Components" },
  { id: "export", label: "Export" },
];

const STATS = [
  { icon: Palette, label: "Color scales", value: PALETTE.length },
  { icon: Component, label: "Primitives", value: 20 },
  { icon: Type, label: "Type tokens", value: TYPE_SCALE.length },
];

function useScrollSpy(ids: string[]) {
  const [active, setActive] = React.useState(ids[0]);
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

const NAV_IDS = NAV.map((n) => n.id);

export function SystemExplorer() {
  const active = useScrollSpy(NAV_IDS);
  const activeLabel = NAV.find((n) => n.id === active)?.label ?? "Overview";

  return (
    <div className="min-h-screen bg-bg">
      <Sidebar items={NAV} active={active} />

      <div className="lg:pl-60">
        {/* Sticky sub-header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-bg/85 px-6 backdrop-blur-md lg:px-10">
          <span className="font-display text-[18px] font-black text-ink lg:hidden">ZOQO</span>
          <Badge color="brand" variant="soft" size="sm">
            {activeLabel}
          </Badge>
          <Link
            href="/trade"
            className="ml-auto flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-medium text-sub transition-colors hover:bg-gray-50 hover:text-ink"
          >
            <TrendingUp size={14} className="text-purple-500" />
            <span className="hidden sm:inline">Open Product</span>
          </Link>
          <span className="hidden text-[12px] text-sub lg:block">
            ZOQO Design System · v1
          </span>
        </header>

        <main className="mx-auto flex max-w-5xl flex-col gap-20 px-6 py-12 lg:px-10">
          {/* Overview */}
          <Section
            id="overview"
            eyebrow="ZOQO Design System"
            title="A living reference for the ZOQO product."
            description={
              <>
                Every color, type ramp, token and component the product ships with —
                in one place. Tokens are <strong className="text-ink">live-editable</strong>:
                change a hex here and the entire app re-themes instantly. When you&apos;re
                happy, <strong className="text-ink">export</strong> the result as CSS, TS, or
                JSON to reuse the system in any project.
              </>
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {STATS.map((s) => (
                <div
                  key={s.label}
                  className="flex items-center gap-4 rounded-[16px] border border-line bg-surface p-5 shadow-e1"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-purple-50 text-purple-600">
                    <s.icon size={20} />
                  </span>
                  <span>
                    <span className="block font-display text-[26px] font-black leading-none text-ink nums">
                      {s.value}
                    </span>
                    <span className="mt-1 block text-[12.5px] text-sub">{s.label}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { icon: Palette, t: "Click swatches to copy" },
                { icon: Sparkles, t: "Edit hex → live re-theme" },
                { icon: Box, t: "Persisted to localStorage" },
                { icon: Download, t: "Export CSS / TS / JSON" },
              ].map((c) => (
                <span
                  key={c.t}
                  className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[12.5px] font-medium text-sub"
                >
                  <c.icon size={14} className="text-purple-500" />
                  {c.t}
                </span>
              ))}
            </div>
          </Section>

          <ColorsSection />
          <TypographySection />
          <TokensSection />
          <ElevationSection />
          <LoadingSection />
          <ComponentsSection />
          <ExportSection />

          <footer className="border-t border-line pt-8 pb-4 text-[12px] text-gray-400">
            ZOQO Design System · generated from{" "}
            <code className="text-sub">src/lib/tokens.ts</code> · explorer at{" "}
            <code className="text-sub">/system</code>.
          </footer>
        </main>
      </div>
    </div>
  );
}
