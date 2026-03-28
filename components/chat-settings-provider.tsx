"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { ModelInfo } from "@/components/model-picker";

export const PORTS = ["8080", "8081"];

export type ServerInfo = {
  contextSize: number;
  modelName: string | null;
  paramsB: number | null;
};

type ChatSettingsContextValue = {
  selectedPort: string;
  setSelectedPort: (port: string) => void;
  toolsEnabled: boolean;
  setToolsEnabled: (enabled: boolean) => void;
  agentsEnabled: boolean;
  setAgentsEnabled: (enabled: boolean) => void;
  agentPort: string;
  setAgentPort: (port: string) => void;
  reasoningEnabled: boolean;
  setReasoningEnabled: (enabled: boolean) => void;
  createDocumentEnabled: boolean;
  setCreateDocumentEnabled: (enabled: boolean) => void;
  programmaticEnabled: boolean;
  setProgrammaticEnabled: (enabled: boolean) => void;
  widgetEnabled: boolean;
  setWidgetEnabled: (enabled: boolean) => void;
  compressionEnabled: boolean;
  setCompressionEnabled: (enabled: boolean) => void;
  modelsInfo: Record<string, ServerInfo>;
  serverInfo: ServerInfo;
  models: ModelInfo[];
};

const ChatSettingsContext = createContext<ChatSettingsContextValue | null>(null);

export function ChatSettingsProvider({ children }: { children: React.ReactNode }) {
  const [selectedPort, setSelectedPort] = useState(PORTS[0]);
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [agentsEnabled, setAgentsEnabled] = useState(false);
  const [agentPort, setAgentPort] = useState(PORTS[0]);
  const [reasoningEnabled, setReasoningEnabled] = useState(true);
  const [createDocumentEnabled, setCreateDocumentEnabled] = useState(false);
  const [programmaticEnabled, setProgrammaticEnabled] = useState(false);
  const [widgetEnabled, setWidgetEnabled] = useState(false);
  const [compressionEnabled, setCompressionEnabled] = useState(false);
  const [modelsInfo, setModelsInfo] = useState<Record<string, ServerInfo>>({});

  useEffect(() => {
    PORTS.forEach((port) => {
      fetch(`/api/server-info?port=${port}`)
        .then((res) => res.json())
        .then((data: ServerInfo) => {
          setModelsInfo((prev) => ({ ...prev, [port]: data }));
        })
        .catch(() => {});
    });
  }, []);

  const serverInfo = modelsInfo[selectedPort] ?? {
    contextSize: 0,
    modelName: null,
    paramsB: null,
  };

  const models: ModelInfo[] = PORTS.map((port) => ({
    port,
    modelName: modelsInfo[port]?.modelName ?? null,
    paramsB: modelsInfo[port]?.paramsB ?? null,
  })).filter((m) => m.modelName !== null);

  return (
    <ChatSettingsContext
      value={{
        selectedPort,
        setSelectedPort,
        toolsEnabled,
        setToolsEnabled,
        agentsEnabled,
        setAgentsEnabled,
        agentPort,
        setAgentPort,
        reasoningEnabled,
        setReasoningEnabled,
        createDocumentEnabled,
        setCreateDocumentEnabled,
        programmaticEnabled,
        setProgrammaticEnabled,
        widgetEnabled,
        setWidgetEnabled,
        compressionEnabled,
        setCompressionEnabled,
        modelsInfo,
        serverInfo,
        models,
      }}
    >
      {children}
    </ChatSettingsContext>
  );
}

export function useChatSettings(): ChatSettingsContextValue {
  const ctx = useContext(ChatSettingsContext);
  if (!ctx) throw new Error("useChatSettings must be used within ChatSettingsProvider");
  return ctx;
}
