"use client";
import * as React from "react";
import { Camera, GripVertical, Maximize2, Minus, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PanelFrameProps {
  title: string;
  children: React.ReactNode;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  onRefresh?: () => void;
  onScreenshot?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  className?: string;
}

/** Shared chrome for every panel in the desktop terminal layout — a
 *  mini-toolbar (drag handle, refresh, collapse/expand, screenshot, close)
 *  wrapping whatever content the panel actually renders. Icons are wired
 *  per-panel by the caller, not uniformly faked: a panel only gets a
 *  Refresh/Screenshot button when that action does something real (see
 *  TerminalShell's usage). */
export function PanelFrame({
  title,
  children,
  collapsed,
  onToggleCollapse,
  onClose,
  onRefresh,
  onScreenshot,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  className,
}: PanelFrameProps) {
  // A collapsed panel shrinks to whatever sliver its react-resizable-panels
  // `collapsedSize` allows (as little as ~32px) — too small for the full
  // header row, so it renders as nothing but a centered expand affordance
  // rather than clipping a header that no longer fits.
  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={`Expand ${title}`}
        title={`Expand ${title}`}
        className="flex h-full w-full items-center justify-center bg-surface text-sub transition-colors hover:text-ink"
      >
        <Maximize2 size={13} />
      </button>
    );
  }

  return (
    <div className={cn("flex h-full flex-col overflow-hidden bg-surface", className)}>
      <div
        className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-2 py-1.5"
        draggable={draggable}
        onDragStart={() => onDragStart?.()}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {draggable && <GripVertical size={13} className="shrink-0 cursor-grab text-sub" />}
          <span className="truncate text-[11px] font-semibold uppercase tracking-wide text-sub">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {onRefresh && <ToolbarIcon icon={RefreshCw} label={`Refresh ${title}`} onClick={onRefresh} />}
          {onScreenshot && <ToolbarIcon icon={Camera} label={`Screenshot ${title}`} onClick={onScreenshot} />}
          {onToggleCollapse && <ToolbarIcon icon={Minus} label={`Collapse ${title}`} onClick={onToggleCollapse} />}
          {onClose && <ToolbarIcon icon={X} label={`Close ${title}`} onClick={onClose} />}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}

function ToolbarIcon({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-sub transition-colors hover:bg-muted hover:text-ink"
    >
      <Icon size={13} />
    </button>
  );
}
