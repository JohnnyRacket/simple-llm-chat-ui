import { tool } from "ai";
import { z } from "zod";

export const createDocument = tool({
  description:
    "Create a markdown document that the user can download. Call this when asked to produce a report, document, or written artifact. " +
    "Put the complete markdown content in `content`. After calling this tool, give a brief high-level summary of what you wrote.",
  inputSchema: z.object({
    filename: z.string().describe("File name without extension (e.g. 'research-report')"),
    content: z.string().describe("Full markdown content of the document"),
    summary: z.string().describe("One to three sentence summary of what the document contains"),
  }),
  execute: async ({ filename, content, summary }) => ({ filename, content, summary }),
});
