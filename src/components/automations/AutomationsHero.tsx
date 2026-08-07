"use client";
import * as React from "react";
import { Bot, Grid2x2, LineChart, Plus, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui";

/** Hero: headline + subtext + CTAs on the left, a 3-step "how it works at a
 *  glance" strip and a decorative Buy/Sell sparkline on the right, mirroring
 *  the Figma hero. The sparkline is static/illustrative only — it isn't
 *  wired to a real trade. */
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

        <div className="flex flex-col items-center gap-6">
          <StepStrip />
          <HeroSparkline />
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

/** Decorative Buy/Sell price sparkline — a static illustration, not a real
 *  chart of any market. */
function HeroSparkline() {
  const path =
    "M0,60 L24,50 L48,56 L72,42 L96,60 L120,68 L144,64 L168,66 L192,56 L216,50 L240,44 L264,48 L288,38 L312,34 L336,20 L360,10";
  return (
    <svg viewBox="0 0 360 110" className="h-[110px] w-full max-w-[380px]" aria-hidden="true">
      <line x1="0" y1="100" x2="360" y2="100" stroke="var(--color-line)" strokeDasharray="2 4" strokeWidth="1" />
      <path d={path} fill="none" stroke="var(--color-purple-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {/* Buy marker */}
      <circle cx="96" cy="60" r="4" fill="var(--color-green-500)" />
      <line x1="96" y1="60" x2="96" y2="78" stroke="var(--color-green-500)" strokeDasharray="2 2" strokeWidth="1" />
      <g transform="translate(70,78)">
        <rect width="52" height="18" rx="9" fill="var(--color-green-500)" />
        <text x="26" y="12.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="white">
          Buy $50
        </text>
      </g>
      {/* Sell marker */}
      <circle cx="312" cy="34" r="4" fill="var(--color-purple-500)" />
      <line x1="312" y1="34" x2="312" y2="26" stroke="var(--color-purple-500)" strokeDasharray="2 2" strokeWidth="1" />
      <g transform="translate(286,8)">
        <rect width="52" height="18" rx="9" fill="var(--color-purple-500)" />
        <text x="26" y="12.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="white">
          Sell $50
        </text>
      </g>
    </svg>
  );
}
