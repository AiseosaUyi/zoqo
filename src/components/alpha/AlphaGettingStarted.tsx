"use client";
import * as React from "react";
import Link from "next/link";
import { Check, CircleAlert, CircleDashed, ExternalLink, ToggleRight, Rocket, FlaskConical } from "lucide-react";
import { Card, Tag } from "@/components/ui";
import type { AlphaVenueDto, AlphaStrategyDto, AlphaHealthCredentialDto } from "./types";

/** First-visit walkthrough for `/alpha` — renders only while the account has
 *  no enabled venue and no strategy yet (docs/alpha/PROMPT-alpha-finish.md
 *  §1). Design review note (phase-7-finish.md): one linear 3-step card, the
 *  next uncompleted step is visually primary and completed steps collapse to
 *  a muted checked row — not three competing CTAs. The needs-setup panel
 *  below it is deliberately lower visual weight (a plain list, no card
 *  border-color escalation) so a first-time visitor's eye lands on the
 *  walkthrough first. Stops rendering the instant either a venue is enabled
 *  or a strategy exists, even for a returning user — no onboarding cruft
 *  that lingers once it's served its purpose. */
export function AlphaGettingStarted({
  venues,
  strategies,
  credentials,
}: {
  venues: AlphaVenueDto[];
  strategies: AlphaStrategyDto[];
  credentials: AlphaHealthCredentialDto[] | undefined;
}) {
  const hasEnabledVenue = venues.some((v) => v.enabled);
  const hasStrategy = strategies.length > 0;
  if (hasEnabledVenue && hasStrategy) return null;

  const steps = [
    {
      key: "venue",
      done: hasEnabledVenue,
      icon: ToggleRight,
      title: "Enable a venue",
      body: "Turn on zoqo-terminal (needs no credential) or an external venue below, in the Venues section.",
    },
    {
      key: "strategy",
      done: hasStrategy,
      icon: FlaskConical,
      title: "Create a strategy",
      body: "Pick a template (e.g. terminal-hourly-momentum), set a budget and max stake, in the Strategies section.",
    },
    {
      key: "run",
      done: false,
      icon: Rocket,
      title: "Press Run now",
      body: "Or wait for the scheduler — enabled strategies run automatically once next_run_at is due.",
    },
  ];

  const missingCredentials = (credentials ?? []).filter((c) => !c.configured);

  return (
    <div className="flex flex-col gap-4">
      <Card padding="lg">
        <h2 className="text-[15px] font-bold text-ink">Get started with Alpha</h2>
        <p className="mt-0.5 text-[12.5px] text-sub">
          Three steps to your first automated (paper) decision. Need API keys first?{" "}
          <Link href="/settings" className="font-semibold text-purple-600 hover:underline">
            Set them up in Settings
          </Link>
          .
        </p>
        <ol className="mt-4 flex flex-col gap-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <li
                key={step.key}
                className={
                  "flex items-start gap-3 rounded-[12px] px-3 py-2.5 " +
                  (step.done ? "opacity-60" : "bg-purple-50/60")
                }
              >
                <span
                  className={
                    "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full " +
                    (step.done ? "bg-green-100 text-green-600" : "bg-purple-100 text-purple-600")
                  }
                >
                  {step.done ? <Check size={16} /> : <Icon size={16} />}
                </span>
                <div>
                  <div className="text-[13.5px] font-semibold text-ink">{step.title}</div>
                  <p className="mt-0.5 text-[12.5px] text-sub">{step.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>

      {missingCredentials.length > 0 && (
        <Card padding="md">
          <div className="flex items-center gap-2">
            <CircleAlert size={15} className="text-gold-600" />
            <h3 className="text-[13px] font-bold text-ink">Needs setup</h3>
            <Tag size="sm" color="gray">
              {missingCredentials.length} missing
            </Tag>
          </div>
          <p className="mt-1 text-[12px] text-sub">
            These venues and data providers stay paper-safe with no key — real conformance tests just stay skipped until you add one.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {(credentials ?? []).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="flex items-center gap-2">
                  {c.configured ? (
                    <Check size={14} className="text-green-600" />
                  ) : (
                    <CircleDashed size={14} className="text-sub" />
                  )}
                  <span className={c.configured ? "text-ink" : "text-sub"}>{c.label}</span>
                  <span className="text-[11px] text-sub">({c.envVar})</span>
                </span>
                {!c.configured && (
                  <a
                    href={c.signupUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-semibold text-purple-600 hover:underline"
                  >
                    Get a key <ExternalLink size={12} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
