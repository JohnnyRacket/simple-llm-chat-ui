interface ResponseStatsProps {
  usage: {
    inputTokens: number;
    outputTokens: number;
    promptTps: number | null;
    generationTps: number | null;
    totalTimeMs: number | null;
  };
  compression?: {
    tokensSaved: number;
    compressionRatio: number;
  } | null;
}

export function ResponseStats({ usage, compression }: ResponseStatsProps) {
  const parts: string[] = [];

  if (usage.promptTps != null) {
    parts.push(`Prompt: ${usage.inputTokens} tokens (${usage.promptTps.toFixed(1)} t/s)`);
  } else {
    parts.push(`Prompt: ${usage.inputTokens} tokens`);
  }

  if (usage.generationTps != null) {
    parts.push(`Response: ${usage.outputTokens} tokens (${usage.generationTps.toFixed(1)} t/s)`);
  } else {
    parts.push(`Response: ${usage.outputTokens} tokens`);
  }

  if (usage.totalTimeMs != null) {
    parts.push(`${(usage.totalTimeMs / 1000).toFixed(1)}s`);
  }

  if (compression && compression.tokensSaved > 0) {
    parts.push(`Compressed: -${compression.tokensSaved.toLocaleString()} tokens (${Math.round((1 - compression.compressionRatio) * 100)}%)`);
  }

  return (
    <div className="flex justify-start mt-1 ml-1">
      <span className="text-xs text-muted-foreground">
        {parts.join(" · ")}
      </span>
    </div>
  );
}
