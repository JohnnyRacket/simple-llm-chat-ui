import { InvalidToolInputError, NoSuchToolError, type ToolCallRepairFunction, type ToolSet } from "ai";
import { logDebug, previewText } from "@/lib/debug-chat-stream";
import { agentTaskSchema, parallelAgentsInputSchema } from "./sub-agent";

const TOOL_NAMES = new Set(["subAgent", "parallelAgents"]);
const TASK_KEYS = ["task", "query", "prompt", "instruction", "goal"] as const;
const ARRAY_KEYS = ["agents", "tasks", "items"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripCodeFences(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function stripTrailingCommas(value: string) {
  return value.replace(/,\s*([}\]])/g, "$1");
}

function extractBalancedJson(value: string) {
  const starts = ["{", "["];

  for (const startToken of starts) {
    const start = value.indexOf(startToken);
    if (start < 0) {
      continue;
    }

    const endToken = startToken === "{" ? "}" : "]";
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < value.length; index++) {
      const char = value[index];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === "\"") {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === startToken) {
        depth += 1;
      } else if (char === endToken) {
        depth -= 1;
        if (depth === 0) {
          return value.slice(start, index + 1);
        }
      }
    }
  }

  return null;
}

function tryParseJson(rawInput: string) {
  const candidates = [
    rawInput.trim(),
    stripCodeFences(rawInput),
    stripTrailingCommas(rawInput.trim()),
    stripTrailingCommas(stripCodeFences(rawInput)),
  ].filter((candidate, index, array) => candidate.length > 0 && array.indexOf(candidate) === index);

  const extracted = extractBalancedJson(rawInput);
  if (extracted) {
    const cleaned = stripTrailingCommas(stripCodeFences(extracted));
    if (!candidates.includes(cleaned)) {
      candidates.push(cleaned);
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
  }

  return null;
}

function getTaskValue(value: Record<string, unknown>) {
  for (const key of TASK_KEYS) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return null;
}

function unwrapAgentInput(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  for (const key of ["input", "arguments", "agent"]) {
    if (key in value) {
      return value[key];
    }
  }

  return value;
}

function normalizeAgentTask(value: unknown) {
  const unwrapped = unwrapAgentInput(value);

  if (typeof unwrapped === "string") {
    const parsed = agentTaskSchema.safeParse({
      task: unwrapped.trim(),
    });
    return parsed.success ? parsed.data : null;
  }

  if (!isRecord(unwrapped)) {
    return null;
  }

  const task = getTaskValue(unwrapped);
  if (!task) {
    return null;
  }

  const parsed = agentTaskSchema.safeParse({
    task: task.slice(0, 2000),
  });

  return parsed.success ? parsed.data : null;
}

function normalizeParallelAgentsInput(value: unknown) {
  const unwrapped = unwrapAgentInput(value);

  let rawAgents: unknown[] | null = null;

  if (Array.isArray(unwrapped)) {
    rawAgents = unwrapped;
  } else if (isRecord(unwrapped)) {
    for (const key of ARRAY_KEYS) {
      const candidate = unwrapped[key];
      if (Array.isArray(candidate)) {
        rawAgents = candidate;
        break;
      }
    }

    if (rawAgents == null) {
      const singleAgent = normalizeAgentTask(unwrapped);
      if (singleAgent) {
        rawAgents = [singleAgent];
      }
    }
  }

  if (rawAgents == null) {
    return null;
  }

  const agents = rawAgents
    .map((agent) => normalizeAgentTask(agent))
    .filter((agent): agent is NonNullable<typeof agent> => agent !== null)
    .slice(0, 8);

  const parsed = parallelAgentsInputSchema.safeParse({ agents });
  return parsed.success ? parsed.data : null;
}

export async function repairParentAgentToolCall<TOOLS extends ToolSet>(
  options: Parameters<ToolCallRepairFunction<TOOLS>>[0]
) {
  const { error, toolCall } = options;

  if (NoSuchToolError.isInstance(error)) {
    return null;
  }

  if (!InvalidToolInputError.isInstance(error) || !TOOL_NAMES.has(toolCall.toolName)) {
    return null;
  }

  logDebug("[chat-stream]", "repair attempt", {
    toolName: toolCall.toolName,
    input: previewText(toolCall.input, 120),
  });

  const parsedInput = tryParseJson(toolCall.input);
  if (parsedInput == null) {
    logDebug("[chat-stream]", "repair failed", {
      toolName: toolCall.toolName,
      reason: "parse_failed",
    });
    return null;
  }

  const repairedInput =
    toolCall.toolName === "subAgent"
      ? normalizeAgentTask(parsedInput)
      : normalizeParallelAgentsInput(parsedInput);

  if (repairedInput == null) {
    logDebug("[chat-stream]", "repair failed", {
      toolName: toolCall.toolName,
      reason: "normalize_failed",
    });
    return null;
  }

  logDebug("[chat-stream]", "repair success", {
    toolName: toolCall.toolName,
  });

  return {
    ...toolCall,
    input: JSON.stringify(repairedInput),
  };
}
