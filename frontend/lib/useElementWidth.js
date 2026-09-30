"use client";

import { useEffect, useState } from "react";

/** The element's content width, kept current with a ResizeObserver (charts lay out in real pixels, not scaled). */
export default function useElementWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
