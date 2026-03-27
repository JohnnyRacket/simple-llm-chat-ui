"use client";

import { Brain, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { ReasoningUIPart } from "ai";

export function ReasoningPart({ part }: { part: ReasoningUIPart }) {
  const [expanded, setExpanded] = useState(false);
  const isStreaming = part.state === "streaming";

  return (
    <div className="my-1 rounded-md border border-amber-500/20 bg-amber-50/50 dark:bg-amber-950/20">
      <button
        type="button"
        onClick={() => !isStreaming && setExpanded((v) => !v)}
        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm rounded-md transition-colors ${
          !isStreaming
            ? "hover:bg-amber-100/50 dark:hover:bg-amber-900/20 cursor-pointer"
            : "cursor-default"
        }`}
      >
        <Brain
          className={`h-4 w-4 shrink-0 text-amber-500 ${isStreaming ? "animate-pulse" : ""}`}
        />
        <span className="flex-1 text-xs font-medium text-amber-700 dark:text-amber-400">
          {isStreaming ? "Thinking…" : "Reasoning"}
        </span>
        {!isStreaming &&
          (expanded ? (
            <ChevronUp className="h-4 w-4 shrink-0 opacity-50" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          ))}
      </button>
      {expanded && !isStreaming && (
        <div className="border-t border-amber-500/20 px-3 py-2">
          <pre className="whitespace-pre-wrap break-words text-xs text-muted-foreground font-mono max-h-96 overflow-y-auto">
            {part.text}
          </pre>
        </div>
      )}
    </div>
  );
}
