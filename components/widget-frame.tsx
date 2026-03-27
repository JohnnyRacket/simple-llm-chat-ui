"use client";

import { useEffect, useRef, useState } from "react";

const RESIZE_SCRIPT = `<script>
(function() {
  function sendHeight() {
    var h = document.documentElement.scrollHeight;
    window.parent.postMessage({ type: 'widget-resize', height: h }, '*');
  }
  window.addEventListener('load', sendHeight);
  var ro = new ResizeObserver(sendHeight);
  ro.observe(document.documentElement);
})();
<\/script>`;

function injectResizeScript(html: string): string {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${RESIZE_SCRIPT}</body>`);
  }
  return html + RESIZE_SCRIPT;
}

export function WidgetFrame({ html, title }: { html: string; title: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(300);

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      if (
        e.data?.type === "widget-resize" &&
        typeof e.data.height === "number" &&
        e.source === iframeRef.current?.contentWindow
      ) {
        setHeight(Math.max(80, Math.min(e.data.height + 16, 1200)));
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="my-1 rounded-md border border-foreground/10 overflow-hidden">
      <div className="px-3 py-1.5 bg-foreground/5 border-b border-foreground/10">
        <span className="text-xs text-muted-foreground">{title}</span>
      </div>
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={injectResizeScript(html)}
        style={{ height, width: "100%", border: "none", display: "block" }}
        title={title}
      />
    </div>
  );
}
