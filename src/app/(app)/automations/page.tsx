"use client";
import * as React from "react";
import { ArrowRight, Bot } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { AutomationsHeader, AutomationsBackRow } from "@/components/automations/AutomationsHeader";
import { AutomationsHero } from "@/components/automations/AutomationsHero";
import { TemplateCard } from "@/components/automations/TemplateCard";
import { CreateAutomationModal } from "@/components/automations/CreateAutomationModal";
import { ActiveAutomations } from "@/components/automations/ActiveAutomations";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "@/components/automations/data";
import { useAutomations } from "@/lib/automations";

/** ZOQO is a fully client-side, localStorage-backed demo — there is no real
 *  automation execution engine (see CLAUDE.md). Backed by lightweight local
 *  mock state (useAutomations), the same spirit as the Poisson retail tape
 *  in engine.ts or the seeded leaderboard in profile.tsx.
 *
 *  Previously this page stacked Hero → Templates → HowItWorksSteps →
 *  BenefitsGrid → CtaBanner — three sections in a row re-arguing "automations
 *  are good" on top of each other, with nothing distinct shown once the user
 *  actually had zero automations. Cut down to Hero → Templates → one real
 *  `EmptyState` (or the populated `ActiveAutomations` list once they've made
 *  one) so the page reads as product, not a landing page justifying an
 *  empty dashboard. */
export default function AutomationsPage() {
  const { ready, automations, create, toggle, remove } = useAutomations();
  const [modalOpen, setModalOpen] = React.useState(false);
  const [activeTemplate, setActiveTemplate] = React.useState<AutomationTemplate | null>(null);
  const templatesRef = React.useRef<HTMLDivElement>(null);

  function openBlankModal() {
    setActiveTemplate(null);
    setModalOpen(true);
  }

  function openTemplateModal(template: AutomationTemplate) {
    setActiveTemplate(template);
    setModalOpen(true);
  }

  function scrollToTemplates() {
    templatesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen bg-bg">
      <AutomationsHeader />
      <AutomationsBackRow />

      <AutomationsHero onCreate={openBlankModal} onBrowseTemplates={scrollToTemplates} />

      <section ref={templatesRef} className="mx-auto max-w-[1200px] scroll-mt-20 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold text-ink">Popular Automation Templates</h2>
            <p className="mt-1 text-[13.5px] text-sub">
              Start with a proven strategy and customize it to fit your goals.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-purple-600">
            View All Templates <ArrowRight size={14} />
          </span>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUTOMATION_TEMPLATES.map((t) => (
            <TemplateCard key={t.key} template={t} onUse={openTemplateModal} />
          ))}
        </div>
      </section>

      {ready && automations.length === 0 && (
        <section className="mx-auto max-w-[1200px] px-4 pb-12 sm:px-6">
          <EmptyState
            icon={Bot}
            title="No automations running yet"
            description="Pick a template above and set your own numbers, or build a blank one from scratch — it takes under a minute."
            action={{ label: "Create automation", onClick: openBlankModal }}
            secondaryAction={{ label: "Browse templates", onClick: scrollToTemplates }}
          />
        </section>
      )}

      {ready && automations.length > 0 && (
        <ActiveAutomations automations={automations} onToggle={toggle} onRemove={remove} />
      )}

      <CreateAutomationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        template={activeTemplate}
        onCreate={create}
      />
    </div>
  );
}
