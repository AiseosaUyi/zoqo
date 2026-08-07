"use client";
import * as React from "react";
import { ArrowRight } from "lucide-react";
import { AutomationsHeader, AutomationsBackRow } from "@/components/automations/AutomationsHeader";
import { AutomationsHero } from "@/components/automations/AutomationsHero";
import { TemplateCard } from "@/components/automations/TemplateCard";
import { HowItWorksSteps } from "@/components/automations/HowItWorksSteps";
import { BenefitsGrid } from "@/components/automations/BenefitsGrid";
import { CtaBanner } from "@/components/automations/CtaBanner";
import { CreateAutomationModal } from "@/components/automations/CreateAutomationModal";
import { ActiveAutomations } from "@/components/automations/ActiveAutomations";
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from "@/components/automations/data";
import { useAutomations } from "@/lib/automations";

/** ZOQO is a fully client-side, localStorage-backed demo — there is no real
 *  automation execution engine (see CLAUDE.md). This page mirrors the Figma
 *  "Automations" marketing/dashboard frame and backs it with lightweight
 *  local mock state (useAutomations), the same spirit as the Poisson retail
 *  tape in engine.ts or the seeded leaderboard in profile.tsx. */
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

      <HowItWorksSteps />
      <BenefitsGrid />

      {ready && (
        <ActiveAutomations automations={automations} onToggle={toggle} onRemove={remove} />
      )}

      <CtaBanner onCreate={openBlankModal} />

      <CreateAutomationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        template={activeTemplate}
        onCreate={create}
      />
    </div>
  );
}
