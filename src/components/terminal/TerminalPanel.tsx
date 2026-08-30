"use client";
import * as React from "react";
import { Panel, usePanelRef } from "react-resizable-panels";
import { PanelFrame } from "@/components/ui";

/** Combines react-resizable-panels' `Panel` (resize/collapse mechanics) with
 *  `PanelFrame` (the visible header/toolbar), so TerminalShell doesn't have
 *  to repeat the collapse-state wiring for every panel it renders. */
export function TerminalPanel({
  id,
  title,
  defaultSize,
  minSize,
  maxSize,
  collapsedSize = 32,
  onClose,
  onRefresh,
  onScreenshot,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  children,
}: {
  id: string;
  title: string;
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
  collapsedSize?: number;
  onClose?: () => void;
  onRefresh?: () => void;
  onScreenshot?: () => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  const panelRef = usePanelRef();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <Panel
      id={id}
      panelRef={panelRef}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      collapsible
      collapsedSize={collapsedSize}
      onResize={() => setCollapsed(!!panelRef.current?.isCollapsed())}
    >
      <PanelFrame
        title={title}
        collapsed={collapsed}
        onToggleCollapse={() => {
          if (panelRef.current?.isCollapsed()) panelRef.current.expand();
          else panelRef.current?.collapse();
        }}
        onClose={onClose}
        onRefresh={onRefresh}
        onScreenshot={onScreenshot}
        draggable={draggable}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {children}
      </PanelFrame>
    </Panel>
  );
}
