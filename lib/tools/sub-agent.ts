import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { webSearch, fetchPage } from "./index";

const BASE_HOST = "http://192.168.1.168";
const AGENT_HEARTBEAT_MS = 3_000;
const MAX_RETRIES = 2;
const QUEUED_MESSAGE = "Queued...";
const STARTING_MESSAGE = "Starting sub-agent...";
const RUNNING_MESSAGE = "Sub-agent still running...";

function getRolePrompt(role: string, hasTools: boolean): string {
  const toolHint = hasTools ? " using web search and page reading as needed" : "";
  const prompts: Record<string, string> = {
    researcher:
      `You are a focused research agent. Research the given topic thoroughly${toolHint}. ` +
      "Return a structured summary with sources. Produce only factual, cited output.",
    planner:
      `You are a planning agent. Break the given task into a clear numbered action plan with concrete steps${toolHint}. Return only the plan.`,
    analyst:
      `You are an analysis agent. Analyze the provided material${toolHint} and return structured findings, risks, and recommendations.`,
    general:
      `You are a focused sub-agent. Complete the given task thoroughly${toolHint} and return a clear structured result.`,
  };
  return prompts[role] ?? prompts.general;
}

export type SubAgentOutput = {
  role: string;
  task: string;
  result: string;
  steps: number;
  toolCallCount: number;
  error?: string;
};

export type ParallelAgentsOutput = {
  agents: SubAgentOutput[];
};

type AgentProgressEvent =
  | { type: "heartbeat" }
  | { type: "result"; result: SubAgentOutput };

type ParallelAgentProgressEvent =
  | { type: "heartbeat" }
  | { type: "result"; index: number; result: SubAgentOutput };

function createPendingAgentOutput(
  task: string,
  role: string,
  result: string
): SubAgentOutput {
  return {
    role,
    task,
    result,
    steps: 0,
    toolCallCount: 0,
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
  abortSignal?: AbortSignal
): Promise<SubAgentOutput> {
  const subTools = enableTools ? { webSearch, fetchPage } : undefined;
  const provider = createOpenAICompatible({
    name: "local-llama",
    baseURL: `${BASE_HOST}:${port}/v1`,
    apiKey: "not-needed",
  });

  let lastEmpty: SubAgentOutput | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (abortSignal?.aborted) break;
    try {
      const result = await generateText({
        model: provider("model"),
        system: getRolePrompt(role, enableTools),
        prompt: task,
        abortSignal,
        ...(subTools ? { tools: subTools, stopWhen: stepCountIs(6) } : {}),
      });
      const output: SubAgentOutput = {
        role,
        task,
        result: result.text,
        steps: result.steps.length,
        toolCallCount: result.steps.reduce((acc, s) => acc + s.toolCalls.length, 0),
      };
      if (result.text.trim().length > 0) return output;
      lastEmpty = output;
    } catch (err) {
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

const agentTaskSchema = z.object({
  task: z.string().min(1).max(2000).describe("The specific task for this agent"),
  role: z
    .enum(["researcher", "planner", "analyst", "general"])
    .default("general")
    .describe("Role specialization"),
});

export function createSubAgentTool(port: string, enableTools: boolean) {
  return tool({
    description:
      "Spin up a single isolated sub-agent to complete one focused task. " +
      "Use this for a single task. For multiple parallel tasks, use parallelAgents instead.",
    inputSchema: agentTaskSchema,
    execute: async function* ({ task, role }, { abortSignal }) {
      const resultPromise: Promise<AgentProgressEvent> = runSubAgent(
        task,
        role,
        port,
        enableTools,
        abortSignal
      ).then((result) => ({ type: "result", result }));
      let lastMessage: string | undefined;

      while (true) {
        const next = await createHeartbeatRace(resultPromise);

        if (next.type === "result") {
          yield next.result;
          return;
        }

        lastMessage = getHeartbeatMessage(lastMessage);
        yield createPendingAgentOutput(task, role, lastMessage);
      }
    },
  });
}

export function createParallelAgentsTool(port: string, enableTools: boolean) {
  return tool({
    description:
      "Spawn multiple sub-agents in parallel, each handling a distinct task. " +
      "All agents run concurrently and their results are returned together. " +
      "Use this whenever you need to research multiple distinct topics, evaluate multiple paths, " +
      "or run any set of independent tasks simultaneously. " +
      "Each agent has its own isolated context" +
      (enableTools ? " and access to web search and page reading tools." : "."),
    inputSchema: z.object({
      agents: z
        .array(agentTaskSchema)
        .min(2)
        .max(8)
        .describe("The list of agents to spawn in parallel. Must have at least 2 tasks."),
    }),
    execute: async function* ({ agents }, { abortSignal }) {
      const results = agents.map(({ task, role }) =>
        createPendingAgentOutput(task, role, QUEUED_MESSAGE)
      );
      yield { agents: [...results] };

      const pending = agents.map(({ task, role }, index) => ({
        index,
        promise: runSubAgent(task, role, port, enableTools, abortSignal).then((result) => ({
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
          for (const { index } of pending) {
            const agent = results[index];
            if (agent.steps === 0 && !agent.error) {
              results[index] = createPendingAgentOutput(
                agent.task,
                agent.role,
                getHeartbeatMessage(agent.result)
              );
            }
          }
          yield { agents: [...results] };
          continue;
        }

        results[next.index] = next.result;
        const settledIndex = pending.findIndex((entry) => entry.index === next.index);
        if (settledIndex >= 0) {
          pending.splice(settledIndex, 1);
        }
        yield { agents: [...results] };
      }
    },
  });
}
