import { tool } from "ai";
import { z } from "zod";

export const getDatetime = tool({
  description:
    "Get the current date and time. IMPORTANT: You do not know today's date " +
    "without calling this tool. Call this BEFORE any search or fetch when the " +
    "query involves relative time expressions like 'this year', 'this month', " +
    "'today', 'recent', 'latest', 'current', 'now', 'best of 2025', or any " +
    "phrasing that requires knowing the current date to form an accurate query.",
  inputSchema: z.object({
    timezone: z
      .string()
      .optional()
      .describe("Optional IANA timezone, e.g. 'America/New_York'. Defaults to UTC."),
  }),
  execute: async ({ timezone }) => {
    const now = new Date();
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      utc: now.toISOString(),
      local: now.toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "long" }),
      timezone: tz,
      unix: Math.floor(now.getTime() / 1000),
    };
  },
});
