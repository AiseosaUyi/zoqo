"use client";
import * as React from "react";
import { Rocket, Star } from "lucide-react";
import {
  Accordion,
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  RadioGroup,
  SegmentedControl,
  Select as UISelect,
  Stat,
  Switch,
  Tabs,
  Tag,
  Textarea,
  Tooltip,
  type AlertVariant,
  type ButtonColor,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui";
import { CodeBlock, ControlRow, Section, Select, Subhead } from "./primitives";

/** A playground frame: live preview on the left, controls + code on the right. */
function Playground({
  title,
  preview,
  controls,
  code,
}: {
  title: string;
  preview: React.ReactNode;
  controls?: React.ReactNode;
  code: string;
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-e1">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h4 className="text-[14px] font-bold text-ink">{title}</h4>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px]">
        <div className="flex min-h-[180px] flex-wrap items-center justify-center gap-4 border-line bg-muted/30 p-8 lg:border-r">
          {preview}
        </div>
        <div className="flex flex-col gap-3 p-5">
          {controls && (
            <div className="flex flex-col gap-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
                Props
              </span>
              {controls}
            </div>
          )}
          <div className={controls ? "mt-1" : ""}>
            <CodeBlock code={code} />
          </div>
        </div>
      </div>
    </div>
  );
}

const BUTTON_VARIANTS: ButtonVariant[] = ["solid", "soft", "outline", "ghost"];
const BUTTON_COLORS: ButtonColor[] = ["brand", "up", "down", "gray", "orange", "blue", "gold"];
const BUTTON_SIZES: ButtonSize[] = ["xs", "sm", "md", "lg", "xl"];

function ButtonPlayground() {
  const [variant, setVariant] = React.useState<ButtonVariant>("solid");
  const [color, setColor] = React.useState<ButtonColor>("brand");
  const [size, setSize] = React.useState<ButtonSize>("md");
  const [loading, setLoading] = React.useState(false);
  const [disabled, setDisabled] = React.useState(false);
  const [withIcon, setWithIcon] = React.useState(false);

  const code = `<Button
  variant="${variant}"
  color="${color}"
  size="${size}"${loading ? "\n  loading" : ""}${disabled ? "\n  disabled" : ""}${
    withIcon ? "\n  leftIcon={<Rocket size={16} />}" : ""
  }
>
  Launch trade
</Button>`;

  return (
    <Playground
      title="Button"
      preview={
        <Button
          variant={variant}
          color={color}
          size={size}
          loading={loading}
          disabled={disabled}
          leftIcon={withIcon ? <Rocket size={16} /> : undefined}
        >
          Launch trade
        </Button>
      }
      controls={
        <>
          <ControlRow label="variant">
            <Select value={variant} onChange={setVariant} options={BUTTON_VARIANTS} />
          </ControlRow>
          <ControlRow label="color">
            <Select value={color} onChange={setColor} options={BUTTON_COLORS} />
          </ControlRow>
          <ControlRow label="size">
            <Select value={size} onChange={setSize} options={BUTTON_SIZES} />
          </ControlRow>
          <ControlRow label="loading">
            <Switch checked={loading} onChange={setLoading} size="sm" />
          </ControlRow>
          <ControlRow label="disabled">
            <Switch checked={disabled} onChange={setDisabled} size="sm" />
          </ControlRow>
          <ControlRow label="leftIcon">
            <Switch checked={withIcon} onChange={setWithIcon} size="sm" />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function SegmentedPlayground() {
  const data = ["Buy", "Sell"];
  const [value, setValue] = React.useState("Buy");
  const [color, setColor] = React.useState<"white" | "up" | "down" | "brand">("up");
  const code = `<SegmentedControl
  data={["Buy", "Sell"]}
  value={value}
  onChange={setValue}
  color="${color}"
/>`;
  return (
    <Playground
      title="SegmentedControl"
      preview={<SegmentedControl data={data} value={value} onChange={setValue} color={color} size="md" />}
      controls={
        <ControlRow label="color">
          <Select value={color} onChange={setColor} options={["white", "up", "down", "brand"] as const} />
        </ControlRow>
      }
      code={code}
    />
  );
}

function SwitchPlayground() {
  const [checked, setChecked] = React.useState(true);
  const [color, setColor] = React.useState<"brand" | "up" | "down">("brand");
  const code = `<Switch
  checked={checked}
  onChange={setChecked}
  color="${color}"
  label="Auto-confirm"
/>`;
  return (
    <Playground
      title="Switch"
      preview={<Switch checked={checked} onChange={setChecked} color={color} label="Auto-confirm" />}
      controls={
        <>
          <ControlRow label="color">
            <Select value={color} onChange={setColor} options={["brand", "up", "down"] as const} />
          </ControlRow>
          <ControlRow label="checked">
            <Switch checked={checked} onChange={setChecked} size="sm" />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function BadgePlayground() {
  const [variant, setVariant] = React.useState<"soft" | "solid" | "outline" | "dot">("soft");
  const code = `<Badge color="up" variant="${variant}">+2.4%</Badge>`;
  return (
    <Playground
      title="Badge"
      preview={
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="up" variant={variant}>+2.4%</Badge>
          <Badge color="down" variant={variant}>-1.1%</Badge>
          <Badge color="brand" variant={variant}>Pro</Badge>
          <Badge color="gold" variant={variant}>Pending</Badge>
          <Badge color="blue" variant={variant}>Info</Badge>
        </div>
      }
      controls={
        <ControlRow label="variant">
          <Select value={variant} onChange={setVariant} options={["soft", "solid", "outline", "dot"] as const} />
        </ControlRow>
      }
      code={code}
    />
  );
}

function AvatarPlayground() {
  const [size, setSize] = React.useState<"mini" | "sm" | "md" | "lg" | "xl">("md");
  const code = `<Avatar name="Ada Lovelace" size="${size}" />`;
  return (
    <Playground
      title="Avatar"
      preview={
        <div className="flex items-center gap-3">
          <Avatar name="Ada Lovelace" size={size} />
          <Avatar name="Satoshi N" size={size} />
          <Avatar name="Grace Hopper" size={size} />
          <Avatar name="Vitalik B" size={size} />
        </div>
      }
      controls={
        <ControlRow label="size">
          <Select value={size} onChange={setSize} options={["mini", "sm", "md", "lg", "xl"] as const} />
        </ControlRow>
      }
      code={code}
    />
  );
}

function InputPlayground() {
  const [size, setSize] = React.useState<"sm" | "md" | "lg">("md");
  const [invalid, setInvalid] = React.useState(false);
  const code = `<Input
  size="${size}"${invalid ? "\n  invalid" : ""}
  placeholder="0.00"
  leftSection="$"
/>`;
  return (
    <Playground
      title="Input"
      preview={
        <div className="w-full max-w-[260px]">
          <Input size={size} invalid={invalid} placeholder="0.00" leftSection="$" rightSection="USD" defaultValue="61240.97" />
        </div>
      }
      controls={
        <>
          <ControlRow label="size">
            <Select value={size} onChange={setSize} options={["sm", "md", "lg"] as const} />
          </ControlRow>
          <ControlRow label="invalid">
            <Switch checked={invalid} onChange={setInvalid} size="sm" />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function TooltipPlayground() {
  const [side, setSide] = React.useState<"top" | "bottom" | "left" | "right">("top");
  const code = `<Tooltip label="Best bid" side="${side}">
  <Button variant="soft" color="gray">Hover me</Button>
</Tooltip>`;
  return (
    <Playground
      title="Tooltip"
      preview={
        <Tooltip label="Best bid · $61,240" side={side}>
          <Button variant="soft" color="gray">Hover me</Button>
        </Tooltip>
      }
      controls={
        <ControlRow label="side">
          <Select value={side} onChange={setSide} options={["top", "bottom", "left", "right"] as const} />
        </ControlRow>
      }
      code={code}
    />
  );
}

function CardPlayground() {
  const [padding, setPadding] = React.useState<"none" | "sm" | "md" | "lg">("md");
  const code = `<Card padding="${padding}">
  <Stat label="Portfolio" value="$12,408.55" valueColor="up" />
</Card>`;
  return (
    <Playground
      title="Card"
      preview={
        <Card padding={padding} className="w-full max-w-[260px]">
          <Stat label="Portfolio value" value="$12,408.55" valueColor="up" />
        </Card>
      }
      controls={
        <ControlRow label="padding">
          <Select value={padding} onChange={setPadding} options={["none", "sm", "md", "lg"] as const} />
        </ControlRow>
      }
      code={code}
    />
  );
}

function StatPlayground() {
  const [valueColor, setValueColor] = React.useState<"ink" | "up" | "down" | "brand">("up");
  const [align, setAlign] = React.useState<"left" | "right" | "center">("left");
  const code = `<Stat
  label="24h change"
  value="+$1,204.18"
  valueColor="${valueColor}"
  align="${align}"
/>`;
  return (
    <Playground
      title="Stat"
      preview={<Stat label="24h change" value="+$1,204.18" valueColor={valueColor} align={align} />}
      controls={
        <>
          <ControlRow label="valueColor">
            <Select value={valueColor} onChange={setValueColor} options={["ink", "up", "down", "brand"] as const} />
          </ControlRow>
          <ControlRow label="align">
            <Select value={align} onChange={setAlign} options={["left", "right", "center"] as const} />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function TabsPlayground() {
  const data = ["Overview", "Order Book", "Trades", "Holders"];
  const [value, setValue] = React.useState("Overview");
  const [size, setSize] = React.useState<"sm" | "md" | "lg">("md");
  const [color, setColor] = React.useState<"brand" | "up" | "down" | "gray">("brand");
  const code = `<Tabs
  data={["Overview", "Order Book", "Trades", "Holders"]}
  value={value}
  onChange={setValue}
  color="${color}"
  size="${size}"
/>`;
  return (
    <Playground
      title="Tabs"
      preview={
        <div className="w-full max-w-[420px]">
          <Tabs data={data} value={value} onChange={setValue} color={color} size={size} />
        </div>
      }
      controls={
        <>
          <ControlRow label="color">
            <Select value={color} onChange={setColor} options={["brand", "up", "down", "gray"] as const} />
          </ControlRow>
          <ControlRow label="size">
            <Select value={size} onChange={setSize} options={["sm", "md", "lg"] as const} />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function CheckboxPlayground() {
  const [checked, setChecked] = React.useState(true);
  const [indeterminate, setIndeterminate] = React.useState(false);
  const [color, setColor] = React.useState<"brand" | "up" | "down" | "gray">("brand");
  const [size, setSize] = React.useState<"sm" | "md" | "lg">("md");
  const code = `<Checkbox
  checked={checked}
  onChange={setChecked}
  color="${color}"
  size="${size}"${indeterminate ? "\n  indeterminate" : ""}
  label="I agree to the terms"
/>`;
  return (
    <Playground
      title="Checkbox"
      preview={
        <Checkbox
          checked={checked}
          onChange={setChecked}
          indeterminate={indeterminate}
          color={color}
          size={size}
          label="I agree to the terms"
        />
      }
      controls={
        <>
          <ControlRow label="color">
            <Select value={color} onChange={setColor} options={["brand", "up", "down", "gray"] as const} />
          </ControlRow>
          <ControlRow label="size">
            <Select value={size} onChange={setSize} options={["sm", "md", "lg"] as const} />
          </ControlRow>
          <ControlRow label="checked">
            <Switch checked={checked} onChange={setChecked} size="sm" />
          </ControlRow>
          <ControlRow label="indeterminate">
            <Switch checked={indeterminate} onChange={setIndeterminate} size="sm" />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function RadioPlayground() {
  const [value, setValue] = React.useState("market");
  const [color, setColor] = React.useState<"brand" | "up" | "down" | "gray">("brand");
  const [orientation, setOrientation] = React.useState<"vertical" | "horizontal">("vertical");
  const code = `<RadioGroup
  data={["market", "limit", "stop"]}
  value={value}
  onChange={setValue}
  color="${color}"
  orientation="${orientation}"
/>`;
  return (
    <Playground
      title="Radio / RadioGroup"
      preview={
        <RadioGroup
          data={[
            { value: "market", label: "Market order" },
            { value: "limit", label: "Limit order" },
            { value: "stop", label: "Stop order" },
          ]}
          value={value}
          onChange={setValue}
          color={color}
          orientation={orientation}
        />
      }
      controls={
        <>
          <ControlRow label="color">
            <Select value={color} onChange={setColor} options={["brand", "up", "down", "gray"] as const} />
          </ControlRow>
          <ControlRow label="orientation">
            <Select value={orientation} onChange={setOrientation} options={["vertical", "horizontal"] as const} />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function TextareaPlayground() {
  const [size, setSize] = React.useState<"sm" | "md" | "lg">("md");
  const [invalid, setInvalid] = React.useState(false);
  const [autosize, setAutosize] = React.useState(false);
  const code = `<Textarea
  size="${size}"${invalid ? "\n  invalid" : ""}${autosize ? "\n  autosize" : ""}
  placeholder="Add a note to this trade…"
/>`;
  return (
    <Playground
      title="Textarea"
      preview={
        <div className="w-full max-w-[300px]">
          <Textarea
            size={size}
            invalid={invalid}
            autosize={autosize}
            placeholder="Add a note to this trade…"
            defaultValue="Closing half my position into the news."
          />
        </div>
      }
      controls={
        <>
          <ControlRow label="size">
            <Select value={size} onChange={setSize} options={["sm", "md", "lg"] as const} />
          </ControlRow>
          <ControlRow label="invalid">
            <Switch checked={invalid} onChange={setInvalid} size="sm" />
          </ControlRow>
          <ControlRow label="autosize">
            <Switch checked={autosize} onChange={setAutosize} size="sm" />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function SelectPlayground() {
  const [value, setValue] = React.useState<string | null>("usd");
  const [size, setSize] = React.useState<"sm" | "md" | "lg">("md");
  const code = `<Select
  data={[
    { value: "usd", label: "US Dollar" },
    { value: "eur", label: "Euro" },
    { value: "btc", label: "Bitcoin" },
  ]}
  value={value}
  onChange={setValue}
  size="${size}"
/>`;
  return (
    <Playground
      title="Select"
      preview={
        <div className="w-full max-w-[220px]">
          <UISelect
            data={[
              { value: "usd", label: "US Dollar" },
              { value: "eur", label: "Euro" },
              { value: "gbp", label: "British Pound" },
              { value: "btc", label: "Bitcoin" },
              { value: "eth", label: "Ethereum" },
            ]}
            value={value}
            onChange={setValue}
            size={size}
            fullWidth
          />
        </div>
      }
      controls={
        <ControlRow label="size">
          <Select value={size} onChange={setSize} options={["sm", "md", "lg"] as const} />
        </ControlRow>
      }
      code={code}
    />
  );
}

function AlertPlayground() {
  const [variant, setVariant] = React.useState<AlertVariant>("info");
  const [dismissible, setDismissible] = React.useState(true);
  const code = `<Alert
  variant="${variant}"
  title="Order submitted"${dismissible ? "\n  dismissible" : ""}
>
  Your limit order is now resting on the book.
</Alert>`;
  return (
    <Playground
      title="Alert"
      preview={
        <div className="w-full max-w-[360px]">
          <Alert variant={variant} title="Order submitted" dismissible={dismissible}>
            Your limit order is now resting on the book at $61,240.
          </Alert>
        </div>
      }
      controls={
        <>
          <ControlRow label="variant">
            <Select value={variant} onChange={setVariant} options={["info", "success", "warning", "error"] as const} />
          </ControlRow>
          <ControlRow label="dismissible">
            <Switch checked={dismissible} onChange={setDismissible} size="sm" />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function TagPlayground() {
  const [color, setColor] = React.useState<"brand" | "up" | "down" | "gray" | "orange" | "blue" | "gold">("brand");
  const [tags, setTags] = React.useState(["Bitcoin", "Volatile", "Trending", "Leverage"]);
  const code = `<Tag color="${color}" onRemove={() => remove(tag)}>
  Bitcoin
</Tag>`;
  return (
    <Playground
      title="Tag"
      preview={
        <div className="flex flex-wrap items-center gap-2">
          {tags.length === 0 && <span className="text-[13px] text-sub">All removed — change a control to reset.</span>}
          {tags.map((t) => (
            <Tag
              key={t}
              color={color}
              leftIcon={<Star size={12} />}
              onRemove={() => setTags((prev) => prev.filter((x) => x !== t))}
            >
              {t}
            </Tag>
          ))}
        </div>
      }
      controls={
        <>
          <ControlRow label="color">
            <Select
              value={color}
              onChange={(c) => {
                setColor(c);
                setTags(["Bitcoin", "Volatile", "Trending", "Leverage"]);
              }}
              options={["brand", "up", "down", "gray", "orange", "blue", "gold"] as const}
            />
          </ControlRow>
        </>
      }
      code={code}
    />
  );
}

function AccordionPlayground() {
  const [multiple, setMultiple] = React.useState(false);
  const code = `<Accordion
  data={[
    { value: "fees", label: "Fees", content: "…" },
    { value: "settle", label: "Settlement", content: "…" },
    { value: "risk", label: "Risk", content: "…" },
  ]}${multiple ? "\n  multiple" : ""}
  defaultValue="fees"
/>`;
  return (
    <Playground
      title="Accordion"
      preview={
        <div className="w-full max-w-[400px]">
          <Accordion
            key={multiple ? "multi" : "single"}
            multiple={multiple}
            defaultValue="fees"
            data={[
              { value: "fees", label: "What are the fees?", content: "A flat 0.1% taker fee per fill. Makers rebate 0.02%." },
              { value: "settle", label: "How does settlement work?", content: "Markets settle automatically at expiry against the index price." },
              { value: "risk", label: "What is my max risk?", content: "Your maximum loss is capped at the premium you paid to enter." },
            ]}
          />
        </div>
      }
      controls={
        <ControlRow label="multiple">
          <Switch checked={multiple} onChange={setMultiple} size="sm" />
        </ControlRow>
      }
      code={code}
    />
  );
}

export function ComponentsSection() {
  return (
    <Section
      id="components"
      eyebrow="Library"
      title="Components"
      description="Every ZOQO primitive with a live, Mantine-style props playground. Tweak the controls and copy the generated JSX."
    >
      <Subhead>Playground</Subhead>
      <div className="flex flex-col gap-5">
        <ButtonPlayground />
        <SegmentedPlayground />
        <TabsPlayground />
        <SwitchPlayground />
        <CheckboxPlayground />
        <RadioPlayground />
        <BadgePlayground />
        <TagPlayground />
        <AvatarPlayground />
        <InputPlayground />
        <TextareaPlayground />
        <SelectPlayground />
        <AlertPlayground />
        <AccordionPlayground />
        <TooltipPlayground />
        <CardPlayground />
        <StatPlayground />
      </div>
    </Section>
  );
}
