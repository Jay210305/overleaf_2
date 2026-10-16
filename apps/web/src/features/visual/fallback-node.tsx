import React, { useState, useEffect } from "react";
import type { LiteralFallbackNode, FallbackReason, VisualBlockNode } from "@latex-collab/editor";

export interface VisualLiteralFallbackProps {
  node: LiteralFallbackNode;
  readOnly?: boolean;
  onFallbackChange?: ((nodeId: string, newRaw: string, expectedHash: string) => void) | undefined;
  onSwitchToCodeMode?: ((offset: number) => void) | undefined;
}

const REASON_LABELS: Record<FallbackReason, { title: string; badgeClass: string }> = {
  preamble: {
    title: "Document Preamble / Setup",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  },
  unknownMacro: {
    title: "Custom / Unsupported Macro",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  },
  complexEnvironment: {
    title: "Complex LaTeX Environment",
    badgeClass: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  },
  verbatim: {
    title: "Verbatim Block",
    badgeClass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  tikz: {
    title: "TikZ Graphic (Vector Output in PDF)",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  },
  parseError: {
    title: "Unparsed LaTeX Syntax",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  },
};

export const VisualLiteralFallback: React.FC<VisualLiteralFallbackProps> = ({
  node,
  readOnly = false,
  onFallbackChange,
  onSwitchToCodeMode,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [rawText, setRawText] = useState(node.raw);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setRawText(node.raw);
  }, [node.raw]);

  const meta = REASON_LABELS[node.reason] || {
    title: "Literal TeX Fragment",
    badgeClass: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };

  const handleCopy = () => {
    navigator.clipboard?.writeText(node.raw);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCommit = () => {
    setIsEditing(false);
    if (rawText !== node.raw) {
      onFallbackChange?.(node.id, rawText, node.hash);
    }
  };

  return (
    <div
      className="visual-literal-fallback my-3 rounded-lg border border-dashed border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/20 p-4 transition-all"
      data-testid="visual-literal-fallback"
      data-node-id={node.id}
      data-fallback-reason={node.reason}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 pb-2 border-b border-amber-200/60 dark:border-amber-800/40 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded font-medium ${meta.badgeClass}`}
            data-testid="fallback-badge"
          >
            {meta.title}
          </span>
          <span className="text-gray-500 text-[11px]" data-testid="fallback-desc">
            {node.description}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="px-2 py-1 text-[11px] rounded bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            data-testid="fallback-copy-btn"
          >
            {copied ? "Copied!" : "Copy TeX"}
          </button>
          {onSwitchToCodeMode && (
            <button
              type="button"
              onClick={() => onSwitchToCodeMode(node.range.start)}
              className="px-2 py-1 text-[11px] rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-800 transition-colors"
              data-testid="fallback-switch-code-btn"
            >
              Edit in Code Mode
            </button>
          )}
        </div>
      </div>

      {isEditing && !readOnly ? (
        <div className="space-y-2">
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            onBlur={handleCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                handleCommit();
              } else if (e.key === "Escape") {
                setRawText(node.raw);
                setIsEditing(false);
              }
            }}
            autoFocus
            rows={Math.min(15, Math.max(3, rawText.split("\n").length))}
            className="w-full p-2.5 font-mono text-xs bg-white dark:bg-gray-900 border border-amber-500 rounded focus:outline-none focus:ring-2 focus:ring-amber-500 text-gray-800 dark:text-gray-200 leading-relaxed"
            aria-label="Edit literal TeX block"
            data-testid="fallback-textarea"
          />
          <div className="flex justify-between text-[10px] text-gray-500 font-mono">
            <span>Ctrl+Enter or blur to save literal splice</span>
            <span>Esc to cancel</span>
          </div>
        </div>
      ) : (
        <div
          className={`relative group ${!readOnly ? "cursor-pointer" : ""}`}
          onClick={() => {
            if (!readOnly && onFallbackChange) {
              setIsEditing(true);
            }
          }}
          data-testid="fallback-code-container"
        >
          <pre
            className="p-3 bg-white/80 dark:bg-gray-900/80 rounded border border-amber-200/50 dark:border-amber-900/30 font-mono text-xs text-gray-800 dark:text-gray-200 overflow-x-auto whitespace-pre leading-relaxed"
            data-testid="fallback-code"
          >
            <code>{node.raw}</code>
          </pre>
          {!readOnly && onFallbackChange && (
            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-[10px] bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 px-2 py-0.5 rounded transition-opacity">
              Click to edit raw TeX
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export interface FallbackNodesViewProps {
  nodes: VisualBlockNode[];
  readOnly?: boolean;
  onFallbackChange?: (nodeId: string, newRaw: string, expectedHash: string) => void;
  onSwitchToCodeMode?: (offset: number) => void;
}

export const FallbackNodesView: React.FC<FallbackNodesViewProps> = ({
  nodes,
  readOnly = false,
  onFallbackChange,
  onSwitchToCodeMode,
}) => {
  const fallbackNodes = nodes.filter((n): n is LiteralFallbackNode => n.kind === "literalFallback");

  return (
    <div className="fallback-nodes-container space-y-4" data-testid="fallback-nodes-container">
      {fallbackNodes.map((node) => (
        <VisualLiteralFallback
          key={node.id}
          node={node}
          readOnly={readOnly}
          onFallbackChange={onFallbackChange}
          onSwitchToCodeMode={onSwitchToCodeMode}
        />
      ))}
    </div>
  );
};
