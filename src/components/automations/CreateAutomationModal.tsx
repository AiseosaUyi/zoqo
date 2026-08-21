"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Bot, Check, X } from "lucide-react";
import { Button, Input, Tag } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import type { Automation } from "@/lib/automations";
import type { AutomationParam, AutomationTemplate } from "./data";

const BLANK_TEMPLATE: Pick<
  AutomationTemplate,
  "category" | "rule" | "ruleTemplate" | "params" | "cooldownLabel" | "executionsLabel"
> & { title: string; key: string } = {
  key: "custom",
  category: "Custom",
  title: "Custom Automation",
  rule: '"Define your own trigger and action — starting amount $25."',
  ruleTemplate: '"Define your own trigger and action — starting amount {amount}."',
  params: [{ key: "amount", label: "Trade amount", default: 25, prefix: "$", min: 5, max: 500, step: 5 }],
  cooldownLabel: "Cooldown 5m",
  executionsLabel: "10 Executions",
};

function formatParam(p: AutomationParam, value: number) {
  return `${p.prefix ?? ""}${value}${p.suffix ?? ""}`;
}

function interpolateRule(ruleTemplate: string, params: AutomationParam[], values: Record<string, number>) {
  return params.reduce(
    (acc, p) => acc.replaceAll(`{${p.key}}`, formatParam(p, values[p.key] ?? p.default)),
    ruleTemplate,
  );
}

function defaultValues(params: AutomationParam[]): Record<string, number> {
  return Object.fromEntries(params.map((p) => [p.key, p.default]));
}

/** Confirm/name/configure a mocked automation and add it to the
 *  locally-persisted list. There is no execution engine behind this — see
 *  the disclosure copy below — creating one just writes a record via
 *  useAutomations(). The rule shown and saved reflects whatever the user
 *  actually set the template's parameters to, not just its default text.
 *  Follows the same createPortal / fixed-overlay / bg-surface shape as
 *  DepositModal. */
export function CreateAutomationModal({
  open,
  onClose,
  template,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  template: AutomationTemplate | null;
  onCreate: (input: Omit<Automation, "id" | "createdAt" | "enabled">) => void;
}) {
  const { signedIn, requireAuth } = useProfile();
  const source = template ?? BLANK_TEMPLATE;
  const [name, setName] = React.useState(source.title);
  const [values, setValues] = React.useState<Record<string, number>>(() => defaultValues(source.params));
  const [created, setCreated] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  // Reset the form each time the modal is (re)opened for a template — own
  // local state, so this uses React's "adjust state during render" pattern
  // instead of an effect, gated on a ref of the last (open, template) pair
  // it already reset for.
  const [resetFor, setResetFor] = React.useState<{ open: boolean; template: AutomationTemplate | null } | null>(
    null,
  );
  if (open && (!resetFor || !resetFor.open || resetFor.template !== template)) {
    setResetFor({ open, template });
    setName(source.title);
    setValues(defaultValues(source.params));
    setCreated(false);
  } else if (!open && resetFor?.open) {
    setResetFor({ open, template });
  }

  const previewRule = interpolateRule(source.ruleTemplate, source.params, values);

  const submit = React.useCallback(() => {
    onCreate({
      name: name.trim() || source.title,
      templateKey: source.key,
      category: source.category,
      rule: interpolateRule(source.ruleTemplate, source.params, values),
      cooldownLabel: source.cooldownLabel,
      executionsLabel: source.executionsLabel,
    });
    setCreated(true);
  }, [name, onCreate, source, values]);

  React.useEffect(() => {
    // submit() calls onCreate(), which writes to the automations list owned
    // by a different component (useAutomations() in the parent) — needs an
    // effect for the same reason as TradeCard's retryTrade.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (pending && signedIn) {
      setPending(false);
      submit();
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [pending, signedIn, submit]);

  if (!open || typeof document === "undefined") return null;

  function handleCreate() {
    if (!requireAuth(() => setPending(true))) return;
    submit();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-gray-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] overflow-hidden rounded-[20px] border bg-surface shadow-[0_24px_64px_rgba(14,17,19,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-display text-[20px] font-black leading-none">
              {created ? "Automation Created" : "New Automation"}
            </h2>
            {!created && <p className="mt-1 text-[12px] text-sub">Based on {source.title}</p>}
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full hover:bg-gray-100">
            <X size={18} className="text-sub" />
          </button>
        </div>

        {created ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-green-100">
              <Check size={28} className="text-green-600" />
            </div>
            <h3 className="text-[18px] font-bold">{name || source.title} is live</h3>
            <p className="text-[13px] text-sub">
              It&apos;s in your active automations now — toggle or delete it any time.
            </p>
            <Button color="brand" fullWidth size="lg" onClick={onClose} className="mt-2">
              Done
            </Button>
          </div>
        ) : (
          <div className="px-5 py-4">
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-brand">
              <Bot size={18} />
            </span>

            <label className="block text-[12px] font-semibold text-sub">Automation name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name your automation"
              size="lg"
              className="mt-1.5"
              autoFocus
              maxLength={40}
            />

            {source.params.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {source.params.map((p) => (
                  <div key={p.key} className={source.params.length === 1 ? "col-span-2" : ""}>
                    <label className="block text-[12px] font-semibold text-sub">{p.label}</label>
                    <Input
                      type="number"
                      value={values[p.key] ?? p.default}
                      onChange={(e) =>
                        setValues((v) => ({ ...v, [p.key]: e.target.value === "" ? 0 : Number(e.target.value) }))
                      }
                      min={p.min}
                      max={p.max}
                      step={p.step}
                      leftSection={p.prefix}
                      rightSection={p.suffix}
                      className="mt-1.5"
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 rounded-[12px] border bg-muted px-4 py-3">
              <p className="text-[11.5px] italic leading-snug text-sub">{previewRule}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Tag color="brand" size="sm">
                  {source.category}
                </Tag>
                <Tag color="gray" size="sm">
                  {source.cooldownLabel}
                </Tag>
                <Tag color="gray" size="sm">
                  {source.executionsLabel}
                </Tag>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-relaxed text-sub">
              This is a demo: automations run automatically once created, but for this build
              executions aren&apos;t simulated live — no real orders are placed on your behalf.
            </p>

            <Button color="brand" fullWidth size="lg" onClick={handleCreate} className="mt-4">
              Create Automation
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
