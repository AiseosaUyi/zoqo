"use client";
import {
  MousePointer2,
  TrendingUp,
  Minus,
  ArrowUpRight,
  Square,
  Columns3,
  Percent,
  Sigma,
  Type,
  MapPin,
  ArrowRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { Tooltip } from "@/components/ui";
import { cn } from "@/lib/cn";

/** A curated 12 of the plugin's 68 drawing tools — TradingView's own
 *  toolbar makes the same call (a default set, "more tools" behind a
 *  submenu) because 68 flat icons is unusable, not a limitation worth
 *  apologizing for. One from most categories: lines, a channel, both
 *  Fibonacci tools traders actually reach for, a shape, and the
 *  annotation set the spec's brief specifically asked for ("put pin
 *  points, put notes"). */
export const DRAWING_TOOLS = [
  { type: "trend-line", label: "Trend Line", Icon: TrendingUp },
  { type: "horizontal-line", label: "Horizontal Line", Icon: Minus },
  { type: "ray", label: "Ray", Icon: ArrowUpRight },
  { type: "rectangle", label: "Rectangle", Icon: Square },
  { type: "parallel-channel", label: "Parallel Channel", Icon: Columns3 },
  { type: "fib-retracement", label: "Fib Retracement", Icon: Percent },
  { type: "fib-extension", label: "Fib Extension", Icon: Sigma },
  { type: "arrow", label: "Arrow", Icon: ArrowRight },
  { type: "text-annotation", label: "Text", Icon: Type },
  { type: "price-label", label: "Price Label / Pin", Icon: MapPin },
  { type: "brush", label: "Brush", Icon: Pencil },
] as const;

export function DrawingToolbar({
  activeTool,
  onSelectTool,
  hasSelection,
  onDeleteSelected,
  hasDrawings,
  onClearAll,
}: {
  activeTool: string | null;
  onSelectTool: (type: string | null) => void;
  hasSelection: boolean;
  onDeleteSelected: () => void;
  hasDrawings: boolean;
  onClearAll: () => void;
}) {
  return (
    <div className="flex w-9 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-2">
      <ToolButton
        label="Cursor (Esc)"
        active={activeTool === null}
        onClick={() => onSelectTool(null)}
      >
        <MousePointer2 size={15} />
      </ToolButton>
      <div className="my-0.5 h-px w-5 bg-line" />
      {DRAWING_TOOLS.map(({ type, label, Icon }) => (
        <ToolButton key={type} label={label} active={activeTool === type} onClick={() => onSelectTool(type)}>
          <Icon size={15} />
        </ToolButton>
      ))}
      <div className="my-0.5 h-px w-5 bg-line" />
      <ToolButton label="Delete selected" active={false} disabled={!hasSelection} onClick={onDeleteSelected}>
        <Trash2 size={15} />
      </ToolButton>
      <ToolButton label="Clear all drawings" active={false} disabled={!hasDrawings} onClick={onClearAll}>
        <X size={15} />
      </ToolButton>
    </div>
  );
}

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} side="right">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "grid h-7 w-7 place-items-center rounded-chip transition-colors",
          disabled
            ? "cursor-not-allowed text-sub/40"
            : active
              ? "bg-purple-50 text-purple-700"
              : "text-sub hover:bg-gray-50 hover:text-ink",
        )}
      >
        {children}
      </button>
    </Tooltip>
  );
}
