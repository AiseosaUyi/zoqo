import type { ReactNode } from "react";
import { Bot, CheckCircle2, FileText, Plus, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui";

const STEPS = [
  {
    n: 1,
    title: "Choose a strategy",
    desc: "Pick a template or start with a blank rule.",
  },
  {
    n: 2,
    title: "Configure your rules",
    desc: "Set your conditions, amount, and risk parameters.",
  },
  {
    n: 3,
    title: "Sit back and relax",
    desc: "We'll monitor the market and execute when conditions are met.",
  },
];

export function HowItWorksSteps() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <h2 className="text-[22px] font-bold text-ink">How Automations Work</h2>
      <p className="mt-1 text-[13.5px] text-sub">Three simple steps to automate your trading.</p>

      <Card padding="lg" className="mt-5">
        <div className="flex flex-col items-stretch gap-6 sm:flex-row sm:items-center sm:justify-between">
          <StepItem n={1} title={STEPS[0].title} desc={STEPS[0].desc}>
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-purple-50 text-purple-600">
              <FileText size={22} />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-purple-500 text-white ring-2 ring-surface">
                <Plus size={11} strokeWidth={3} />
              </span>
            </span>
          </StepItem>

          <Arrow />

          <StepItem n={2} title={STEPS[1].title} desc={STEPS[1].desc}>
            <span className="grid h-14 w-14 place-items-center rounded-full bg-purple-50 text-purple-600">
              <SlidersHorizontal size={22} />
            </span>
          </StepItem>

          <Arrow />

          <StepItem n={3} title={STEPS[2].title} desc={STEPS[2].desc}>
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-purple-50 text-purple-600">
              <Bot size={22} />
              <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-green-500 text-white ring-2 ring-surface">
                <CheckCircle2 size={12} />
              </span>
            </span>
          </StepItem>
        </div>
      </Card>
    </section>
  );
}

function StepItem({
  n,
  title,
  desc,
  children,
}: {
  n: number;
  title: string;
  desc: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center gap-3">
      <div className="relative shrink-0">{children}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-ink">
          <span className="text-sub">{n}</span> {title}
        </div>
        <p className="mt-0.5 text-[12px] leading-snug text-sub">{desc}</p>
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div aria-hidden="true" className="hidden h-px w-10 shrink-0 border-t-2 border-dashed border-purple-200 sm:block" />
  );
}
