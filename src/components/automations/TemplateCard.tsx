import { Button, Card, Tag } from "@/components/ui";
import { describeAutomation } from "@/lib/automations";
import type { AutomationTemplate } from "./data";

export function TemplateCard({
  template,
  onUse,
}: {
  template: AutomationTemplate;
  onUse: (template: AutomationTemplate) => void;
}) {
  const Icon = template.icon;
  return (
    <Card padding="md" className="flex flex-col">
      <div className="flex items-start justify-between">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-purple-50 text-purple-600">
          <Icon size={17} />
        </span>
        <Tag color="gray" size="sm">
          {template.category}
        </Tag>
      </div>

      <h3 className="mt-3 text-[15px] font-bold text-ink">{template.title}</h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-sub">{template.description}</p>

      <div className="mt-3 rounded-[10px] border bg-muted px-3 py-2.5">
        <p className="text-[11.5px] italic leading-snug text-sub">
          {describeAutomation(template.symbol, template.condition, template.action)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Tag color="gray" size="sm">
          {template.cooldownLabel}
        </Tag>
      </div>

      <Button
        color="brand"
        variant="outline"
        fullWidth
        className="mt-4"
        onClick={() => onUse(template)}
      >
        Use Template
      </Button>
    </Card>
  );
}
