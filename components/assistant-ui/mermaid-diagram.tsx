"use client";

import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import mermaid from "mermaid";
import { FC, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Props for the MermaidDiagram component
 */
export type MermaidDiagramProps = SyntaxHighlighterProps & {
  className?: string;
};

// Configure mermaid options here - theme will be determined dynamically
mermaid.initialize({ startOnLoad: false });

/**
 * MermaidDiagram component for rendering Mermaid diagrams
 * Use it by passing to `componentsByLanguage` for mermaid in `markdown-text.tsx`
 *
 * @example
 * const MarkdownTextImpl = () => {
 *   return (
 *     <MarkdownTextPrimitive
 *       remarkPlugins={[remarkGfm]}
 *       className="aui-md"
 *       components={defaultComponents}
 *       componentsByLanguage={{
 *         mermaid: {
 *           SyntaxHighlighter: MermaidDiagram
 *         },
 *       }}
 *     />
 *   );
 * };
 */
export const MermaidDiagram: FC<MermaidDiagramProps> = ({
  code,
  className,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);

  useEffect(() => {
    // Skip if no code
    if (!code || code.trim().length === 0) return;

    (async () => {
      setIsRendering(true);
      setError(null);
      
      try {
        // Detect current theme
        const isDark = document.documentElement.classList.contains('dark');
        const theme = isDark ? 'dark' : 'default';
        
        // Re-initialize mermaid with current theme
        mermaid.initialize({ theme, startOnLoad: false });
        
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(id, code);
        if (ref.current) {
          ref.current.innerHTML = result.svg;
          result.bindFunctions?.(ref.current);
        }
        setIsRendering(false);
      } catch (error) {
        // Display user-friendly error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        setError(`Unable to render diagram: ${errorMessage}`);
        setIsRendering(false);
        
        // Still log in development for debugging
        if (process.env.NODE_ENV === 'development') {
          console.error("Failed to render Mermaid diagram:", error);
        }
      }
    })();
  }, [code]);

  if (error) {
    return (
      <div className={cn("bg-destructive/10 border border-destructive/20 rounded-b-lg p-4", className)}>
        <p className="text-sm text-destructive font-medium mb-2">Diagram Error</p>
        <p className="text-xs text-muted-foreground">{error}</p>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            View diagram code
          </summary>
          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
            <code>{code}</code>
          </pre>
        </details>
      </div>
    );
  }

  if (isRendering && !error) {
    return (
      <div className={cn("bg-muted rounded-b-lg p-4 text-center", className)}>
        <p className="text-sm text-muted-foreground">Drawing diagram...</p>
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("bg-muted rounded-b-lg p-2 text-center [&_svg]:mx-auto", className)} />
  );
};

MermaidDiagram.displayName = "MermaidDiagram";
