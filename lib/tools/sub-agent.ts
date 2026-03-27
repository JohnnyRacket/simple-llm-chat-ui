import { tool, generateText, stepCountIs } from "ai";
import { z } from "zod";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { webSearch, fetchPage } from "./index";

const BASE_HOST = "http://192.168.1.168";

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

async function runSubAgent(
  task: string,
  role: string,
  port: string,
  enableTools: boolean
): Promise<SubAgentOutput> {
  const subTools = enableTools ? { webSearch, fetchPage } : undefined;
  const provider = createOpenAICompatible({
    name: "local-llama",
    baseURL: `${BASE_HOST}:${port}/v1`,
    apiKey: "not-needed",
  });
  try {
    const result = await generateText({
      model: provider("model"),
      system: getRolePrompt(role, enableTools),
      prompt: task,
      ...(subTools ? { tools: subTools, stopWhen: stepCountIs(6) } : {}),
    });
    return {
      role,
      task,
      result: result.text,
      steps: result.steps.length,
      toolCallCount: result.steps.reduce((acc, s) => acc + s.toolCalls.length, 0),
    };
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
    execute: async ({ task, role }): Promise<SubAgentOutput> =>
      runSubAgent(task, role, port, enableTools),
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
    execute: async ({ agents }): Promise<ParallelAgentsOutput> => {
      const results = await Promise.all(
        agents.map(({ task, role }) => runSubAgent(task, role, port, enableTools))
      );
      return { agents: results };
    },
  });
}
