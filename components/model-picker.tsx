"use client";

import { ChevronDown, Check } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

export type ModelInfo = {
  port: string;
  modelName: string | null;
  paramsB: number | null;
};

export function ModelPicker({
  models,
  selectedPort,
  onSelect,
}: {
  models: ModelInfo[];
  selectedPort: string;
  onSelect: (port: string) => void;
}) {
  const current = models.find((m) => m.port === selectedPort);
  const label = current
    ? [current.modelName, current.paramsB ? `${current.paramsB}B` : null]
        .filter(Boolean)
        .join(" · ")
    : "Select model";

  return (
    <Popover>
      <PopoverTrigger className="flex w-full items-center gap-1 min-w-0 hover:text-foreground transition-colors cursor-pointer">
        <span className="truncate min-w-0">{label}</span>
        <ChevronDown className="size-3 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="min-w-48">
        <div className="space-y-0.5">
          {models.map((m) => {
            const isSelected = m.port === selectedPort;
            const name = [
              m.modelName ?? `Port ${m.port}`,
              m.paramsB ? `${m.paramsB}B` : null,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <button
                key={m.port}
                type="button"
                onClick={() => onSelect(m.port)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Check
                  className={`size-3 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`}
                />
                <span className="truncate">{name}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
