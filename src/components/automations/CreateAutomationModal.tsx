"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { Bot, Check, X } from "lucide-react";
import { Button, Input, Select, SegmentedControl, Tag } from "@/components/ui";
import { useProfile } from "@/lib/profile";
import { describeAutomation, type Automation, type AutomationCondition } from "@/lib/automations";
import { ASSETS } from "@/lib/assets";
import { AUTOMATION_TEMPLATES, DEFAULT_MAX_ORDER_SIZE, DEFAULT_DAILY_CAP, type AutomationTemplate } from "./data";

const BLANK_TEMPLATE: AutomationTemplate = {
  ...AUTOMATION_TEMPLATES[0],
  key: "custom",
  category: "Custom",
  title: "Custom Automation",
  description: "Define your own condition, asset, and order size.",
};

function defaultValues(params: AutomationTemplate["params"]): Record<string, number> {
  return Object.fromEntries(params.map((p) => [p.key, p.default]));
}

function conditionFromForm(
  type: AutomationCondition["type"],
  values: Record<string, number>,
  direction: string,
): AutomationCondition {
  if (type === "price-cross") {
    return { type, direction: direction as "above" | "below", price: values.price ?? 0 };
  }
  if (type === "pct-change") {
    return { type, direction: direction as "up" | "down", pct: values.pct ?? 0, windowMin: values.windowMin ?? 5 };
  }
  return { type, fastMin: values.fastMin ?? 5, slowMin: values.slowMin ?? 20 };
}

/** Confirm/name/configure a real terminal automation and add it to the
 *  persisted list — see src/lib/automations.ts's Automation type and
 *  PHASE_C_HANDOFF.md's C1/C2 for how this actually gets evaluated once
 *  signed in with the backend enabled. Follows the same createPortal /
 *  fixed-overlay / bg-surface shape as DepositModal. */
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
  const isCustom = template === null;
  const source = template ?? BLANK_TEMPLATE;

  const [name, setName] = React.useState(source.title);
  const [symbol, setSymbol] = React.useState(source.symbol);
  const [conditionType, setConditionType] = React.useState<AutomationCondition["type"]>(source.condition.type);
  const [direction, setDirection] = React.useState<string>(
    source.condition.type === "price-cross" || source.condition.type === "pct-change" ? source.condition.direction : "above",
  );
  const [side, setSide] = React.useState<"long" | "short">(source.action.side);
  const [sizeType, setSizeType] = React.useState<"fixed" | "pct-buying-power">(source.action.sizeType);
  const [values, setValues] = React.useState<Record<string, number>>(() => defaultValues(source.params));
  const [maxOrderSize, setMaxOrderSize] = React.useState(DEFAULT_MAX_ORDER_SIZE);
  const [dailyCap, setDailyCap] = React.useState(DEFAULT_DAILY_CAP);
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
    setSymbol(source.symbol);
    setConditionType(source.condition.type);
    setDirection(source.condition.type === "price-cross" || source.condition.type === "pct-change" ? source.condition.direction : "above");
    setSide(source.action.side);
    setSizeType(source.action.sizeType);
    setValues(defaultValues(source.params));
    setMaxOrderSize(DEFAULT_MAX_ORDER_SIZE);
    setDailyCap(DEFAULT_DAILY_CAP);
    setCreated(false);
  } else if (!open && resetFor?.open) {
    setResetFor({ open, template });
  }

  // Switching condition type on the Custom path swaps in that type's own
  // param defaults (each of the three real condition types has exactly one
  // matching entry in AUTOMATION_TEMPLATES) — direction/values follow it.
  function selectConditionType(type: AutomationCondition["type"]) {
    const match = AUTOMATION_TEMPLATES.find((t) => t.condition.type === type) ?? BLANK_TEMPLATE;
    setConditionType(type);
    setDirection(match.condition.type === "price-cross" || match.condition.type === "pct-change" ? match.condition.direction : "above");
    setValues(defaultValues(match.params));
  }

  const params = (AUTOMATION_TEMPLATES.find((t) => t.condition.type === conditionType) ?? BLANK_TEMPLATE).params;
  const condition = conditionFromForm(conditionType, values, direction);
  const sizeValue = values.sizeValue ?? 25;
  const previewRule = describeAutomation(symbol, condition, { side, sizeType, sizeValue });

  const submit = React.useCallback(() => {
    onCreate({
      name: name.trim() || source.title,
      templateKey: source.key,
      category: source.category,
      symbol,
      condition,
      action: { side, sizeType, sizeValue },
      maxOrderSize,
      dailyCap,
      rule: previewRule,
    });
    setCreated(true);
  }, [name, onCreate, source, symbol, condition, side, sizeType, sizeValue, maxOrderSize, dailyCap, previewRule]);

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
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-gray-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-[460px] overflow-hidden rounded-[20px] border bg-surface shadow-[0_24px_64px_rgba(14,17,19,0.25)]"
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
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">
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

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-sub">Asset</label>
                <Select
                  className="mt-1.5"
                  size="lg"
                  value={symbol}
                  onChange={setSymbol}
                  data={ASSETS.map((a) => ({ value: a.id, label: a.symbol }))}
                />
              </div>
              {isCustom && (
                <div>
                  <label className="block text-[12px] font-semibold text-sub">Condition</label>
                  <Select
                    className="mt-1.5"
                    size="lg"
                    value={conditionType}
                    onChange={(v) => selectConditionType(v as AutomationCondition["type"])}
                    data={[
                      { value: "price-cross", label: "Price Cross" },
                      { value: "pct-change", label: "% Move" },
                      { value: "ma-cross", label: "MA Crossover" },
                    ]}
                  />
                </div>
              )}
              {(conditionType === "price-cross" || conditionType === "pct-change") && (
                <div className={isCustom ? "col-span-2" : ""}>
                  <label className="block text-[12px] font-semibold text-sub">Direction</label>
                  <SegmentedControl
                    className="mt-1.5"
                    size="md"
                    fullWidth
                    value={direction}
                    onChange={setDirection}
                    data={
                      conditionType === "price-cross"
                        ? [{ value: "above", label: "Above" }, { value: "below", label: "Below" }]
                        : [{ value: "up", label: "Up" }, { value: "down", label: "Down" }]
                    }
                  />
                </div>
              )}
            </div>

            {params.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {params.map((p) => (
                  <div key={p.key} className={params.length % 2 === 1 && p === params[params.length - 1] ? "col-span-2" : ""}>
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

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-sub">Side</label>
                <SegmentedControl
                  className="mt-1.5"
                  size="md"
                  fullWidth
                  value={side}
                  onChange={(v) => setSide(v as "long" | "short")}
                  data={[{ value: "long", label: "Long" }, { value: "short", label: "Short" }]}
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-sub">Size type</label>
                <SegmentedControl
                  className="mt-1.5"
                  size="md"
                  fullWidth
                  value={sizeType}
                  onChange={(v) => setSizeType(v as "fixed" | "pct-buying-power")}
                  data={[{ value: "fixed", label: "$ Fixed" }, { value: "pct-buying-power", label: "% Buying power" }]}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-semibold text-sub">Max order size</label>
                <Input
                  type="number"
                  value={maxOrderSize}
                  onChange={(e) => setMaxOrderSize(e.target.value === "" ? 0 : Number(e.target.value))}
                  leftSection="$"
                  min={1}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-sub">Daily cap</label>
                <Input
                  type="number"
                  value={dailyCap}
                  onChange={(e) => setDailyCap(e.target.value === "" ? 0 : Number(e.target.value))}
                  leftSection="$"
                  min={1}
                  className="mt-1.5"
                />
              </div>
            </div>

            <div className="mt-4 rounded-[12px] border bg-muted px-4 py-3">
              <p className="text-[11.5px] italic leading-snug text-sub">{previewRule}</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <Tag color="brand" size="sm">
                  {source.category}
                </Tag>
                <Tag color="gray" size="sm">
                  {source.cooldownLabel}
                </Tag>
              </div>
            </div>

            {source.helperText && (conditionType === "pct-change" || conditionType === "ma-cross") && (
              <p className="mt-2 text-[11px] leading-relaxed text-amber-700">{source.helperText}</p>
            )}

            <p className="mt-3 text-[11px] leading-relaxed text-sub">
              Once created and signed in, this evaluates against live price data roughly every
              minute and places real paper orders on your behalf — max order size and daily cap are
              enforced server-side regardless of what this form asks for.
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
