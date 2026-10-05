"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Shows the email HTML in an isolated frame. No scripts run inside (sandbox without
 * allow-scripts); same-origin is allowed only so the frame can size itself to the email.
 */
export function EmailFrame({ html, width, title }: { html: string; width: number; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    let observer: ResizeObserver | undefined;
    const attach = () => {
      const doc = frame.contentDocument;
      if (!doc?.body) return;
      const measure = () => setHeight(doc.documentElement.scrollHeight);
      measure();
      // Re-measure when the email reflows, e.g. cards stacking at phone width.
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
    };
    frame.addEventListener("load", attach);
    attach();
    return () => {
      frame.removeEventListener("load", attach);
      observer?.disconnect();
    };
  }, [html]);

  return (
    <iframe
      ref={ref}
      title={title}
      srcDoc={html}
      sandbox="allow-same-origin"
      className="mx-auto block max-w-full border-0 bg-white shadow-sm"
      style={{ width, height }}
    />
  );
}
