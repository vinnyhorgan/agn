"use client";

import { Settings2 } from "lucide-react";

import type { ProviderSettings as ProviderSettingsValue } from "@/lib/llm/types";

import { Input } from "@/components/ui/input";

interface ProviderSettingsProps {
  settings: ProviderSettingsValue;
  onChange: (settings: ProviderSettingsValue) => void;
}

export function ProviderSettings({
  settings,
  onChange,
}: ProviderSettingsProps) {
  return (
    <details className="group relative">
      <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800">
        <Settings2 className="size-4 text-zinc-400" aria-hidden="true" />
        Provider
      </summary>
      <div className="absolute right-0 z-20 mt-2 grid w-[min(520px,calc(100vw-2rem))] gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-2xl md:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
          Base URL
          <Input
            value={settings.baseUrl}
            placeholder="https://openrouter.ai/api/v1"
            className="bg-zinc-900 text-zinc-100"
            onChange={(event) =>
              onChange({ ...settings, baseUrl: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
          Model
          <Input
            value={settings.model}
            placeholder="openai/gpt-4.1-mini"
            className="bg-zinc-900 text-zinc-100"
            onChange={(event) =>
              onChange({ ...settings, model: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
          API key
          <Input
            value={settings.apiKey}
            type="password"
            autoComplete="off"
            placeholder="Not saved"
            className="bg-zinc-900 text-zinc-100"
            onChange={(event) =>
              onChange({ ...settings, apiKey: event.target.value })
            }
          />
        </label>
      </div>
    </details>
  );
}
