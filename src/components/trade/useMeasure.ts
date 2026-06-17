"use client";
import { useCallback, useRef, useState } from "react";

/** Track an element's content-box width/height via ResizeObserver.
 *  Uses a callback ref so it measures correctly even when the node mounts
 *  later (e.g. behind a `ready` guard), not just on the component's mount. */
export function useMeasure<T extends HTMLElement = HTMLDivElement>() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const roRef = useRef<ResizeObserver | null>(null);

  const ref = useCallback((node: T | null) => {
    roRef.current?.disconnect();
    if (!node) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setSize({ width: cr.width, height: cr.height });
    });
    ro.observe(node);
    roRef.current = ro;
    setSize({ width: node.clientWidth, height: node.clientHeight });
  }, []);

  return { ref, ...size };
}
