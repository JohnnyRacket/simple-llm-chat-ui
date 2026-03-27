"use client";

import { useState } from "react";
import { FileText, ChevronDown, ChevronUp } from "lucide-react";

export function FileAttachment({
  filename,
  pages,
  content,
}: {
  filename: string;
  pages: number;
  content: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-1 rounded-md border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary-foreground/10 transition-colors rounded-md"
      >
        <FileText className="h-4 w-4 shrink-0 opacity-70" />
        <span className="flex-1 truncate font-medium">
          {filename}
          {pages > 0 && (
            <span className="ml-1.5 font-normal opacity-70">({pages} pages)</span>
          )}
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 shrink-0 opacity-70" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-primary-foreground/20 px-3 py-2">
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs opacity-80 font-mono">
            {content.trim()}
          </pre>
        </div>
      )}
    </div>
  );
}
