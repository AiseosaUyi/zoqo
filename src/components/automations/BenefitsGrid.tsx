import { Brain, Clock, Shield, Zap } from "lucide-react";
import { Card } from "@/components/ui";

const BENEFITS = [
  {
    icon: Clock,
    title: "Trade 24/7",
    desc: "Markets never sleep. Your strategy doesn't have to either.",
  },
  {
    icon: Brain,
    title: "Remove Emotion",
    desc: "Stick to your plan and avoid emotional decision making.",
  },
  {
    icon: Shield,
    title: "Protect Your Capital",
    desc: "Set stop losses and limits to manage risk automatically.",
  },
  {
    icon: Zap,
    title: "Instant Execution",
    desc: "Execute trades the moment conditions are met.",
  },
];

export function BenefitsGrid() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <h2 className="text-[22px] font-bold text-ink">Why Use Automations?</h2>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map((b) => (
          <Card key={b.title} padding="md">
            <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-gray-100 text-ink">
              <b.icon size={17} />
            </span>
            <h3 className="mt-3 text-[14px] font-bold text-ink">{b.title}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-sub">{b.desc}</p>
          </Card>
        ))}
      </div>
    </section>
  );
}
