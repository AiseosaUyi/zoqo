"use client";
import * as React from "react";

/** Copy-to-clipboard with transient "copied" feedback keyed by an id. */
export function useCopy(timeout = 1400) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = React.useCallback(
    async (text: string, id?: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Fallback for non-secure contexts.
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand("copy");
        } catch {
          /* ignore */
        }
        document.body.removeChild(ta);
      }
      const key = id ?? text;
      setCopied(key);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), timeout);
    },
    [timeout],
  );

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return { copied, copy, isCopied: (id: string) => copied === id };
}
