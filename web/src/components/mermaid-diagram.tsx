"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
  caption?: string;
}

export function MermaidDiagram({ chart, caption }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const mermaid = (await import("mermaid")).default;

        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            // Talos design: light pinkish bg, dark text, pink accent
            background: "#FCF8F8",
            primaryColor: "#FBE0E0",
            primaryTextColor: "#2D2D2D",
            primaryBorderColor: "#F5AFAF",
            lineColor: "#8E8383",
            secondaryColor: "#F9DFDF",
            tertiaryColor: "#FBEFEF",
            edgeLabelBackground: "#FCF8F8",
            clusterBkg: "#FBEFEF",
            clusterBorder: "#F9DFDF",
            titleColor: "#2D2D2D",
            nodeBorder: "#F5AFAF",
            fontFamily: "ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace",
            fontSize: "11px",
          },
          flowchart: { curve: "linear", padding: 12 },
        });

        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(rendered);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Render error");
      }
    }

    render();
    return () => { cancelled = true; };
  }, [chart]);

  if (error) {
    return (
      <div className="border border-border p-4 text-xs text-muted">
        <span className="text-foreground">[DIAGRAM ERROR]</span> {error}
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="border border-border p-6 text-xs text-muted flex items-center gap-2">
        <span className="animate-pulse">▋</span> Rendering diagram...
      </div>
    );
  }

  return (
    <div className="border border-border bg-surface">
      <div
        ref={ref}
        className="overflow-x-auto p-4"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {caption && (
        <div className="border-t border-border px-4 py-2 text-xs text-muted font-mono">
          {caption}
        </div>
      )}
    </div>
  );
}
