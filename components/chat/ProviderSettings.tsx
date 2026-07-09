"use client";

import { KeyRound } from "lucide-react";

import type { DeepInfraSettings } from "@/lib/llm/types";

import { Input } from "@/components/ui/input";

interface ProviderSettingsProps {
  settings: DeepInfraSettings;
  onChange: (settings: DeepInfraSettings) => void;
}

export function ProviderSettings({
  settings,
  onChange,
}: ProviderSettingsProps) {
  return (
    <details className="group relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800">
        <KeyRound className="size-4 text-zinc-400" aria-hidden="true" />
        DeepInfra
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
        <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
          DeepInfra API key
          <Input
            value={settings.apiKey}
            type="password"
            autoComplete="off"
            placeholder="Not saved"
            className="bg-zinc-900 text-zinc-100"
            onChange={(event) =>
              onChange({ apiKey: event.target.value })
            }
          />
        </label>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Kept in this browser tab only.
        </p>
      </div>
    </details>
  );
}
