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
    <details className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-zinc-950">
        <Settings2 className="size-4 text-zinc-500" aria-hidden="true" />
        Provider settings
      </summary>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1.5 text-xs font-medium text-zinc-600">
          Base URL
          <Input
            value={settings.baseUrl}
            placeholder="https://openrouter.ai/api/v1"
            onChange={(event) =>
              onChange({ ...settings, baseUrl: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-600">
          Model
          <Input
            value={settings.model}
            placeholder="openai/gpt-4.1-mini"
            onChange={(event) =>
              onChange({ ...settings, model: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-zinc-600">
          API key
          <Input
            value={settings.apiKey}
            type="password"
            autoComplete="off"
            placeholder="Not saved"
            onChange={(event) =>
              onChange({ ...settings, apiKey: event.target.value })
            }
          />
        </label>
      </div>
    </details>
  );
}
