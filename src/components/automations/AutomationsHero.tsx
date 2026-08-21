"use client";
import * as React from "react";
import { Bot, Grid2x2, LineChart, Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui";

/** Hero: headline + subtext + CTAs on the left, a 3-step "how it works at a
 *  glance" strip on the right. Used to also carry a second, near-duplicate
 *  "How Automations Work" section plus a decorative sparkline further down
 *  the page — cut both: this strip already tells the whole story, and a
 *  static illustration wired to nothing didn't earn its place. */
export function AutomationsHero({
  onCreate,
  onBrowseTemplates,
}: {
  onCreate: () => void;
  onBrowseTemplates: () => void;
}) {
  return (
    <section className="mx-auto max-w-[1200px] px-4 pt-6 pb-10 sm:px-6 sm:pt-8">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
        <div>
          <h1 className="font-display text-[34px] font-black leading-[1.08] tracking-tight text-ink sm:text-[42px]">
            Put your strategy
            <br />
            on autopilot.
          </h1>
          <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-sub">
            Create automated trading rules that execute for you when market conditions are met.
            Never miss an opportunity, even when you&apos;re offline.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button color="brand" size="lg" leftIcon={<Plus size={17} />} onClick={onCreate}>
              Create Your First Automation
            </Button>
            <Button
              color="gray"
              variant="outline"
              size="lg"
              leftIcon={<Grid2x2 size={16} />}
              onClick={onBrowseTemplates}
            >
              Browse Template
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center">
          <StepStrip />
        </div>
      </div>
    </section>
  );
}

function StepStrip() {
  return (
    <div className="flex w-full items-center justify-center gap-1">
      <StepCard icon={LineChart} title="You set the rules" desc="Define when, how much and where" />
      <Connector />
      <RobotBadge />
      <Connector />
      <StepCard icon={TrendingUp} title="It executes for you" desc="Instant execution when rules are met" accent="up" />
    </div>
  );
}

function StepCard({
  icon: Icon,
  title,
  desc,
  accent = "brand",
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: string;
  accent?: "brand" | "up";
}) {
  return (
    <div className="flex w-[128px] flex-col items-center gap-2 rounded-[14px] border bg-surface p-3 text-center shadow-e1 sm:w-[140px]">
      <span
        className={
          accent === "up"
            ? "grid h-8 w-8 place-items-center rounded-[10px] bg-green-100 text-green-600"
            : "grid h-8 w-8 place-items-center rounded-[10px] bg-purple-50 text-purple-600"
        }
      >
        <Icon size={16} />
      </span>
      <div>
        <div className="text-[11.5px] font-bold leading-tight text-ink">{title}</div>
        <div className="mt-0.5 text-[10px] leading-snug text-sub">{desc}</div>
      </div>
    </div>
  );
}

/** Approximates the Figma robot mascot with a lucide Bot glyph on a gradient
 *  badge — same technique as AuthModal's RewardsIllustration precedent. */
function RobotBadge() {
  return (
    <div className="flex w-[92px] flex-col items-center gap-2 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-purple-500 to-purple-700 shadow-brand ring-4 ring-purple-50">
        <Bot size={26} className="text-white" strokeWidth={2} />
      </span>
      <div>
        <div className="text-[11.5px] font-bold leading-tight text-ink">Zoqo watches the market 24/7</div>
        <div className="mt-0.5 text-[10px] leading-snug text-sub">Monitoring conditions in real-time</div>
      </div>
    </div>
  );
}

function Connector() {
  return (
    <div
      aria-hidden="true"
      className="hidden h-px w-6 shrink-0 border-t-2 border-dashed border-purple-200 sm:block"
    />
  );
}
