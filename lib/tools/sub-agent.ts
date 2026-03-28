import { tool, generateText, stepCountIs, wrapLanguageModel } from "ai";
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { webSearch, fetchPage } from "./index";
import { errorMessage, logDebug, previewText } from "@/lib/debug-chat-stream";
import { createHeadroomMiddleware, createStatsAccumulator } from "@/lib/headroom";

const BASE_HOST = "http://192.168.1.168";
const AGENT_HEARTBEAT_MS = 3_000;
const MAX_RETRIES = 2;
const QUEUED_MESSAGE = "Queued...";
const STARTING_MESSAGE = "Starting sub-agent...";
const RUNNING_MESSAGE = "Sub-agent still running...";
const DEFAULT_AGENT_ROLE = "general";

function getRolePrompt(role: string, hasTools: boolean): string {
  const toolHint = hasTools ? " using web search and page reading as needed" : "";
  const outputRules =
    " Keep the response compact and structured. " +
    "Do not include long narration, hidden reasoning, or filler. " +
    "Return only the useful result for the parent agent to synthesize.";
  const prompts: Record<string, string> = {
    researcher:
      `You are a focused research agent. Research the given topic thoroughly${toolHint}. ` +
      "Return a short structured summary with sources. Produce only factual, cited output." +
      outputRules,
    planner:
      `You are a planning agent. Break the given task into a clear numbered action plan with concrete steps${toolHint}. ` +
      "Return only the plan." +
      outputRules,
    analyst:
      `You are an analysis agent. Analyze the provided material${toolHint} and return short structured findings, risks, and recommendations.` +
      outputRules,
    general:
      `You are a focused sub-agent. Complete the given task thoroughly${toolHint} and return a clear structured result.` +
      outputRules +
      " End with a brief final summary that can be used directly in the parent answer.",
  };
  return prompts[role] ?? prompts.general;
}

type SubAgentRunResult = {
  role: string;
  task: string;
  result: string;
  steps: number;
  toolCallCount: number;
  error?: string;
};

export type SubAgentOutput = {
  result: string;
  error?: string;
  pending?: boolean;
};

export type ParallelAgentOutput = {
  task: string;
  result: string;
  error?: string;
  pending?: boolean;
};

export type ParallelAgentsOutput = {
  agents: ParallelAgentOutput[];
};

type AgentProgressEvent =
  | { type: "heartbeat" }
  | { type: "result"; result: SubAgentRunResult };

type ParallelAgentProgressEvent =
  | { type: "heartbeat" }
  | { type: "result"; index: number; result: SubAgentRunResult };

function createPendingSubAgentOutput(result: string): SubAgentOutput {
  return {
    result,
    pending: true,
  };
}

function createPendingParallelAgentOutput(
  task: string,
  result: string
): ParallelAgentOutput {
  return {
    task,
    result,
    pending: true,
  };
}

function toSubAgentOutput(result: SubAgentRunResult): SubAgentOutput {
  return {
    result: result.result,
    ...(result.error ? { error: result.error } : {}),
  };
}

function toParallelAgentOutput(result: SubAgentRunResult): ParallelAgentOutput {
  return {
    task: result.task,
    result: result.result,
    ...(result.error ? { error: result.error } : {}),
  };
}

function waitForHeartbeat(ms: number) {
  return new Promise<{ type: "heartbeat" }>((resolve) => {
    setTimeout(() => resolve({ type: "heartbeat" }), ms);
  });
}

function getHeartbeatMessage(previousMessage?: string) {
  return previousMessage === QUEUED_MESSAGE || previousMessage == null
    ? STARTING_MESSAGE
    : RUNNING_MESSAGE;
}

function createHeartbeatRace<T>(promise: Promise<T>) {
  return Promise.race<T | { type: "heartbeat" }>([
    promise,
    waitForHeartbeat(AGENT_HEARTBEAT_MS),
  ]);
}

async function runSubAgent(
  task: string,
  role: string,
  port: string,
  enableTools: boolean,
  enableCompression: boolean,
  abortSignal?: AbortSignal
): Promise<SubAgentRunResult> {
  logDebug("[subAgent]", "run start", {
    role,
    port,
    task: previewText(task),
  });
  const subTools = enableTools ? { webSearch, fetchPage } : undefined;
  const provider = createOpenAICompatible({
    name: "local-llama",
    baseURL: `${BASE_HOST}:${port}/v1`,
    apiKey: "not-needed",
  });
  const baseModel = provider("model");
  const model = enableCompression
    ? wrapLanguageModel({ model: baseModel, middleware: createHeadroomMiddleware(createStatsAccumulator()) })
    : baseModel;

  let lastEmpty: SubAgentRunResult | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (abortSignal?.aborted) break;
    try {
      logDebug("[subAgent]", "run attempt", {
        role,
        attempt,
      });
      const result = await generateText({
        model,
        system: getRolePrompt(role, enableTools),
        prompt: task,
        abortSignal,
        ...(subTools ? { tools: subTools, stopWhen: stepCountIs(6) } : {}),
      });
      const output: SubAgentRunResult = {
        role,
        task,
        result: result.text,
        steps: result.steps.length,
        toolCallCount: result.steps.reduce((acc, s) => acc + s.toolCalls.length, 0),
      };
      if (result.text.trim().length > 0) {
        logDebug("[subAgent]", "run ok", {
          role,
          steps: output.steps,
          toolCallCount: output.toolCallCount,
          textLength: output.result.length,
        });
        return output;
      }
      logDebug("[subAgent]", "run empty", {
        role,
        attempt,
      });
      lastEmpty = output;
    } catch (err) {
      logDebug("[subAgent]", "run error", {
        role,
        attempt,
        error: errorMessage(err),
      });
      return {
        role,
        task,
        result: "",
        steps: 0,
        toolCallCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  return lastEmpty ?? { role, task, result: "", steps: 0, toolCallCount: 0 };
}

export const agentTaskSchema = z.object({
  task: z.string().min(1).max(2000).describe("The specific task for this agent"),
});

export const parallelAgentsInputSchema = z.object({
  agents: z
    .array(agentTaskSchema)
    .min(2)
    .max(8)
    .describe("The list of agents to spawn in parallel. Must have at least 2 tasks."),
});

export function createSubAgentTool(port: string, enableTools: boolean, enableCompression: boolean) {
  return tool({
    description:
      "Spin up a single isolated sub-agent to complete one focused task. " +
      "Use this for a single task. For multiple parallel tasks, use parallelAgents instead.",
    inputSchema: agentTaskSchema,
    execute: async function* ({ task }, { abortSignal }) {
      const role = DEFAULT_AGENT_ROLE;
      logDebug("[subAgent]", "tool start", {
        role,
        task: previewText(task),
      });
      const resultPromise: Promise<AgentProgressEvent> = runSubAgent(
        task,
        role,
        port,
        enableTools,
        enableCompression,
        abortSignal
      ).then((result) => ({ type: "result", result }));
      let lastMessage: string | undefined;

      while (true) {
        const next = await createHeartbeatRace(resultPromise);

        if (next.type === "result") {
          logDebug("[subAgent]", "tool result", {
            role,
            hasError: Boolean(next.result.error),
            steps: next.result.steps,
            toolCallCount: next.result.toolCallCount,
          });
          yield toSubAgentOutput(next.result);
          return;
        }

        lastMessage = getHeartbeatMessage(lastMessage);
        logDebug("[subAgent]", "tool heartbeat", {
          role,
          status: lastMessage,
        });
        yield createPendingSubAgentOutput(lastMessage);
      }
    },
  });
}

export function createParallelAgentsTool(port: string, enableTools: boolean, enableCompression: boolean) {
  return tool({
    description:
      "Spawn multiple sub-agents in parallel, each handling a distinct task. " +
      "All agents run concurrently and their results are returned together. " +
      "Use this whenever you need to research multiple distinct topics, evaluate multiple paths, " +
      "or run any set of independent tasks simultaneously. " +
      "Each agent has its own isolated context" +
      (enableTools ? " and access to web search and page reading tools." : "."),
    inputSchema: parallelAgentsInputSchema,
    execute: async function* ({ agents }, { abortSignal }) {
      logDebug("[parallelAgents]", "start", {
        count: agents.length,
      });
      const results = agents.map(({ task }) =>
        createPendingParallelAgentOutput(task, QUEUED_MESSAGE)
      );
      yield { agents: [...results] };

      const pending = agents.map(({ task }, index) => ({
        index,
        promise: runSubAgent(
          task,
          DEFAULT_AGENT_ROLE,
          port,
          enableTools,
          enableCompression,
          abortSignal
        ).then((result) => ({
          type: "result" as const,
          index,
          result,
        })),
      }));

      while (pending.length > 0) {
        const next = await createHeartbeatRace<ParallelAgentProgressEvent>(
          Promise.race(pending.map(({ promise }) => promise))
        );

        if (next.type === "heartbeat") {
          logDebug("[parallelAgents]", "heartbeat", {
            pending: pending.length,
          });
          for (const { index } of pending) {
            const agent = results[index];
            if (agent.pending && !agent.error) {
              results[index] = createPendingParallelAgentOutput(
                agent.task,
                getHeartbeatMessage(agent.result)
              );
            }
          }
          yield { agents: [...results] };
          continue;
        }

        logDebug("[parallelAgents]", "agent result", {
          index: next.index,
          hasError: Boolean(next.result.error),
          steps: next.result.steps,
          toolCallCount: next.result.toolCallCount,
        });
        results[next.index] = toParallelAgentOutput(next.result);
        const settledIndex = pending.findIndex((entry) => entry.index === next.index);
        if (settledIndex >= 0) {
          pending.splice(settledIndex, 1);
        }
        yield { agents: [...results] };
      }
    },
  });
}
