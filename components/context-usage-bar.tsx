import { TriangleAlert } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export function ContextUsageBar({
  inputTokens,
  outputTokens,
  contextSize,
  modelPicker,
}: {
  inputTokens: number;
  outputTokens: number;
  contextSize: number;
  modelPicker?: React.ReactNode;
}) {
  const totalTokens = (inputTokens || 0) + (outputTokens || 0);
  const showBar = contextSize > 0;
  const percentage = showBar
    ? Math.min((totalTokens / contextSize) * 100, 100)
    : 0;

  const barColor =
    percentage > 60
      ? "bg-red-500"
      : percentage > 40
        ? "bg-yellow-500"
        : "bg-green-500";

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      {modelPicker}
      {showBar && (
        <>
          <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden min-w-16">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barColor}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="whitespace-nowrap">
            {totalTokens.toLocaleString()} / {contextSize.toLocaleString()}
          </span>
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
        </>
      )}
    </div>
  );
}
