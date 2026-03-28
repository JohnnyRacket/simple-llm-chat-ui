import { FoldVertical, Layers, TriangleAlert } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export type CompressionInfo = {
  tokensSaved: number;
  compressionRatio: number;
};

export function ContextUsageBar({
  inputTokens,
  outputTokens,
  contextSize,
  modelPicker,
  compression,
}: {
  inputTokens: number;
  outputTokens: number;
  contextSize: number;
  modelPicker?: React.ReactNode;
  compression?: CompressionInfo | null;
}) {
  const totalTokens = (inputTokens || 0) + (outputTokens || 0);
  const showBar = contextSize > 0;
  const percentage = showBar
    ? Math.min((totalTokens / contextSize) * 100, 100)
    : 0;

  const strokeColor =
    percentage > 60
      ? "stroke-red-500"
      : percentage > 40
        ? "stroke-yellow-500"
        : "stroke-green-500";

  const dashOffset = CIRCUMFERENCE * (1 - percentage / 100);

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground min-w-0">
      <div className="flex-1 min-w-0 max-w-[140px] sm:max-w-none overflow-hidden">{modelPicker}</div>
      {showBar && (
        <>
          {/* Progress wheel + % */}
          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <svg width="18" height="18" viewBox="0 0 18 18" className="-rotate-90">
                  <circle
                    cx="9" cy="9" r={RADIUS}
                    fill="none"
                    strokeWidth="2.5"
                    className="stroke-muted"
                  />
                  <circle
                    cx="9" cy="9" r={RADIUS}
                    fill="none"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={CIRCUMFERENCE}
                    strokeDashoffset={dashOffset}
                    className={`${strokeColor} transition-all duration-300`}
                  />
                </svg>
              </TooltipTrigger>
              <TooltipContent>
                {totalTokens.toLocaleString()} / {contextSize.toLocaleString()} tokens
              </TooltipContent>
            </Tooltip>
            <span className="tabular-nums flex items-center gap-1">{Math.round(percentage)}% <Layers className="size-3 opacity-50" /> {Math.round(contextSize / 1000)}K</span>
            {compression && compression.tokensSaved > 0 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-teal-600 dark:text-teal-400">
                    <FoldVertical className="size-3" />
                    <span className="tabular-nums">-{compression.tokensSaved >= 1000 ? `${(compression.tokensSaved / 1000).toFixed(1)}K` : compression.tokensSaved}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Headroom saved {compression.tokensSaved.toLocaleString()} tokens ({Math.round((1 - compression.compressionRatio) * 100)}% compressed)
                </TooltipContent>
              </Tooltip>
            )}
            {percentage > 60 && (
              <Tooltip>
                <TooltipTrigger className="text-red-500">
                  <TriangleAlert className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent>
                  High context usage can cause degraded performance
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </>
      )}
    </div>
  );
}
