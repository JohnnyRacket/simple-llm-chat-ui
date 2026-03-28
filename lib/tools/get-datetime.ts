import { tool } from "ai";
import { z } from "zod";

export const getDatetime = tool({
  description:
    "Get the current date and time. Returns the current UTC and local time, " +
    "day of week, and Unix timestamp. Use this when the user asks about the " +
    "current date, time, or day of week.",
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
