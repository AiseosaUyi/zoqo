import * as React from "react";
import { Button } from "./Button";
import { cn } from "@/lib/cn";

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  className?: string;
}

/** A real "you have nothing here yet" state — dashed container (the
 *  established empty-state affordance, distinct from a solid Card) with an
 *  icon, a title/description that should carry actual personality rather
 *  than generic copy, and up to two actions. Used wherever a list/section
 *  can legitimately be empty instead of silently rendering nothing. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-[16px] border border-dashed border-line-strong bg-muted px-6 py-12 text-center",
        className,
      )}
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-purple-50 text-purple-600">
        <Icon size={26} />
      </span>
      <h3 className="mt-4 text-[17px] font-bold text-ink">{title}</h3>
      <p className="mt-1.5 max-w-[380px] text-[13.5px] leading-relaxed text-sub">{description}</p>
      {(action || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {action && (
            <Button color="brand" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button color="gray" variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
