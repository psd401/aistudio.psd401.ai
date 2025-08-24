"use client";

import { useMessagePart } from "@assistant-ui/react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import mermaid from "mermaid";
import { FC, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Props for the MermaidDiagram component
 */
export type MermaidDiagramProps = SyntaxHighlighterProps & {
  className?: string;
};

// Initialize mermaid once at module level
mermaid.initialize({ theme: "default", startOnLoad: false });

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
  const ref = useRef<HTMLPreElement>(null);

  // Smart completion detection for streaming scenarios
  const isComplete = useMessagePart((part) => {
    if (part.type !== "text") return false;

    const codeIndex = part.text.indexOf(code);
    if (codeIndex === -1) return false;

    const afterCode = part.text.substring(codeIndex + code.length);

    // Check if closing backticks appear after the code
    const closingBackticksMatch = afterCode.match(/^```|^\n```/);
    return closingBackticksMatch !== null;
  });

  useEffect(() => {
    // Only render when the code block is complete
    if (!isComplete) return;

    (async () => {
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
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Failed to render Mermaid diagram:", e);
        }
      }
    })();
  }, [isComplete, code]);

  return (
    <pre ref={ref} className={cn("bg-muted rounded-b-lg p-2 text-center [&_svg]:mx-auto", className)} />
  );
};

MermaidDiagram.displayName = "MermaidDiagram";