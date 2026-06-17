"use client";
import * as React from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> {
  size?: "sm" | "md" | "lg";
  invalid?: boolean;
  /** grow with content instead of scrolling */
  autosize?: boolean;
  /** min rows when autosize (also the default visible height) */
  minRows?: number;
}

const SIZES = { sm: "text-[13px] py-2", md: "text-[14px] py-2.5", lg: "text-[15px] py-3" };

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    { size = "md", invalid, autosize, minRows = 3, className, onChange, rows, ...rest },
    ref,
  ) {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const setRefs = (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
    };

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el || !autosize) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }, [autosize]);

    React.useEffect(() => {
      resize();
    }, [resize]);

    return (
      <div
        className={cn(
          "flex rounded-[10px] border bg-surface px-3 transition-colors",
          "focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100",
          invalid && "border-red-400 focus-within:ring-red-100",
          SIZES[size],
          className,
        )}
      >
        <textarea
          ref={setRefs}
          rows={rows ?? minRows}
          onChange={(e) => {
            resize();
            onChange?.(e);
          }}
          className={cn(
            "min-w-0 flex-1 resize-none bg-transparent leading-relaxed outline-none placeholder:text-gray-400",
            autosize ? "overflow-hidden" : "scroll-thin resize-y",
          )}
          {...rest}
        />
      </div>
    );
  },
);
