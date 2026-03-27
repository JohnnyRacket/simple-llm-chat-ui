import { tool } from "ai";
import { z } from "zod";
import { execFile } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

const MAX_OUTPUT_CHARS = 8_000;
const TIMEOUT_MS = 30_000;

const DOCKER_CONFIG = {
  python:     { image: "python:3.12-slim", filename: "script.py", cmd: ["python", "/data/script.py"] },
  javascript: { image: "node:20-slim",     filename: "script.js", cmd: ["node",   "/data/script.js"] },
  bash:       { image: "alpine:latest",    filename: "script.sh", cmd: ["sh",     "/data/script.sh"] },
} as const;

function truncate(s: string) {
  return s.length <= MAX_OUTPUT_CHARS
    ? { text: s, truncated: false }
    : { text: s.slice(0, MAX_OUTPUT_CHARS), truncated: true };
}

async function runInDocker(language: keyof typeof DOCKER_CONFIG, code: string, inputData?: string) {
  const config = DOCKER_CONFIG[language];
  const tmpDir = await mkdtemp(join(tmpdir(), "llm-sandbox-"));
  try {
    await writeFile(join(tmpDir, config.filename), code, "utf8");
    if (inputData !== undefined) {
      await writeFile(join(tmpDir, "input.txt"), inputData, "utf8");
    }
    const dockerArgs = [
      "run", "--rm",
      "--network", "none",
      "--memory", "256m",
      "--cpus", "0.5",
      "--pids-limit", "64",
      "--read-only",
      "--tmpfs", "/tmp:size=64m",
      "-v", `${tmpDir}:/data:ro`,
      config.image,
      ...config.cmd,
    ];
    const { stdout, stderr, exitCode } = await new Promise<{ stdout: string; stderr: string; exitCode: number }>(
      (resolve) => {
        execFile("docker", dockerArgs, { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
          if (err && (err as { killed?: boolean }).killed) {
            resolve({
              stdout: stdout ?? "",
              stderr: `[Timed out after ${TIMEOUT_MS / 1000}s]\n${stderr ?? ""}`,
              exitCode: 124,
            });
          } else {
            resolve({
              stdout: stdout ?? "",
              stderr: stderr ?? "",
              exitCode: (err as { code?: number } | null)?.code ?? 0,
            });
          }
        });
      }
    );
    const out = truncate(stdout);
    const err = truncate(stderr);
    return {
      stdout: out.text,
      stderr: err.text,
      exitCode,
      language,
      ...(out.truncated || err.truncated ? { truncated: true } : {}),
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export const executeCode = tool({
  description:
    "Execute code in a sandboxed Docker container with no network access. " +
    "Supports Python, JavaScript (Node.js), and Bash. Timeout: 30s. " +
    "If inputData is provided it is written to /data/input.txt inside the container. " +
    "Use this for calculations, data processing, or any computation.",
  inputSchema: z.object({
    language: z.enum(["python", "javascript", "bash"]).describe("Language to execute"),
    code: z.string().min(1).max(32_000).describe("The code to run"),
    inputData: z.string().max(64_000).optional().describe("Optional data passed to the script as /data/input.txt"),
  }),
  execute: async (input: { language: "python" | "javascript" | "bash"; code: string; inputData?: string }) => {
    const { language, code, inputData } = input;
    try {
      return await runInDocker(language, code, inputData);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("ENOENT") || msg.includes("Cannot connect")) {
        return { stdout: "", stderr: "Docker is not available on this server.", exitCode: 1, language };
      }
      throw err;
    }
  },
});
