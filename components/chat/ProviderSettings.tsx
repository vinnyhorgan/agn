"use client";

import { CheckCircle2, KeyRound, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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
  const containerRef = useRef<HTMLDetailsElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;

      if (
        target instanceof Node &&
        !containerRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <details
      ref={containerRef}
      open={isOpen}
      className="group relative"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
    >
      <summary
        className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-sm font-medium text-zinc-200 transition-colors hover:bg-zinc-800"
        onClick={(event) => {
          event.preventDefault();
          setIsOpen((current) => !current);
        }}
      >
        <KeyRound className="size-4 text-zinc-400" aria-hidden="true" />
        DeepInfra
        {settings.apiKey ? (
          <span className="size-1.5 rounded-full bg-emerald-400" aria-label="API key saved" />
        ) : null}
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-lg border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
        <label className="grid gap-1.5 text-xs font-medium text-zinc-400">
          DeepInfra API key
          <Input
            value={settings.apiKey}
            type="password"
            autoComplete="off"
            placeholder="Saved in this browser"
            className="bg-zinc-900 text-zinc-100"
            onChange={(event) =>
              onChange({ apiKey: event.target.value })
            }
          />
        </label>
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs leading-5 text-zinc-500">
            {settings.apiKey ? <CheckCircle2 className="size-3.5 text-emerald-400" aria-hidden="true" /> : null}
            {settings.apiKey ? "Saved in this browser" : "Never sent until you ask"}
          </p>
          {settings.apiKey ? (
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-red-300"
              onClick={() => onChange({ apiKey: "" })}
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              Forget
            </button>
          ) : null}
        </div>
      </div>
    </details>
  );
}
