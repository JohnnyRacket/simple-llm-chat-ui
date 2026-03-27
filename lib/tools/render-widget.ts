import { tool } from "ai";
import { z } from "zod";

export const renderWidget = tool({
  description:
    "Render an interactive visual widget directly in the chat. Use this when a visual or interactive component " +
    "would be more useful than plain text — e.g. charts, graphs, calculators, data tables, timelines, forms, games, " +
    "or any other interactive UI. " +
    "Provide a complete self-contained HTML document with all scripts and styles inline. " +
    "You may use React 19 via esm.sh importmaps, or plain JavaScript. " +
    "Use inline styles or load a stylesheet from a CDN. " +
    "The widget runs in a sandboxed iframe — it cannot access the parent page, cookies, or storage. " +
    "After calling this tool, briefly describe what you built.",
  inputSchema: z.object({
    title: z.string().describe("Short label for the widget, e.g. 'Bar Chart: Q1 Sales' or 'BMI Calculator'"),
    html: z.string().describe(
      "Complete self-contained HTML document. Must include <!DOCTYPE html> and all scripts/styles inline or via CDN. " +
      "CORRECT React pattern — copy this exactly:\n" +
      "<script type=\"importmap\">{\"imports\":{\"react\":\"https://esm.sh/react@19\",\"react-dom/client\":\"https://esm.sh/react-dom@19/client\"}}</script>\n" +
      "<script type=\"module\">\n" +
      "import React, { useState, useEffect } from 'react';\n" +
      "import { createRoot } from 'react-dom/client';\n" +
      "function App() { return React.createElement('div', null, 'hello'); }\n" +
      "createRoot(document.getElementById('root')).render(React.createElement(App));\n" +
      "</script>\n" +
      "RULES: (1) ALL hooks (useState, useEffect, etc.) import from 'react', NOT 'react-dom/client'. " +
      "(2) Use createRoot (imported from 'react-dom/client'), never ReactDOM.createRoot. " +
      "(3) No JSX — use React.createElement() since there is no transpiler. " +
      "(4) No TypeScript."
    ),
  }),
  execute: async ({ html, title }) => ({ html, title }),
});
