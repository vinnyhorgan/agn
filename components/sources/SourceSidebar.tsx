"use client";

import {
  AlertTriangle,
  Check,
  Copy,
  FileText,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useRef, useState } from "react";

import { SourceSearch } from "@/components/sources/SourceSearch";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { BrowserSirDeck, SelectedSource } from "@/components/sources/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SearchResult } from "@/lib/search/types";
import {
  sirGenerationPrompt,
  sirGenerationWorkflowSteps,
} from "@/lib/sir/sirGenerationPrompt";
import type { SirValidationError } from "@/lib/sir/types";
import { cn } from "@/lib/utils";

interface SourceSidebarProps {
  decks: BrowserSirDeck[];
  errors: SirValidationError[];
  isLoading: boolean;
  searchQuery: string;
  searchResultCount: number;
  searchResults: SearchResult[];
  selectedSource?: SelectedSource;
  lastViewedSlideByDeckId: Record<string, number>;
  onUploadFiles: (files: FileList | null) => void;
  onRemoveDeck: (deckId: string) => Promise<void>;
  onSearchQueryChange: (query: string) => void;
  onSelectSource: (source: SelectedSource) => void;
}

export function SourceSidebar({
  decks,
  errors,
  isLoading,
  searchQuery,
  searchResultCount,
  searchResults,
  selectedSource,
  lastViewedSlideByDeckId,
  onUploadFiles,
  onRemoveDeck,
  onSearchQueryChange,
  onSelectSource,
}: SourceSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isGenerateSirOpen, setIsGenerateSirOpen] = useState(false);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    onUploadFiles(event.target.files);
    event.target.value = "";
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary text-sm font-bold tracking-tight text-primary-foreground shadow-sm shadow-primary/15">
              A
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight text-foreground">AGN</p>
              <p className="truncate text-xs text-muted-foreground">
                Actually Good Notebook
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="hidden items-center gap-1.5 rounded-full border border-border bg-background/70 px-2 py-1 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground xl:flex">
              <span className="size-1.5 rounded-full bg-primary" />
              LOCAL
            </span>
            <ThemeToggle />
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sir"
          multiple
          className="sr-only"
          disabled={isLoading}
          onChange={handleFileChange}
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isLoading ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Upload aria-hidden="true" />
            )}
            Upload .sir
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsGenerateSirOpen(true)}
          >
            <Sparkles aria-hidden="true" />
            Generate SIR
          </Button>
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Sources
          </h2>
          <Badge variant="outline" className="border-border text-muted-foreground">
            {decks.length}
          </Badge>
        </div>
        {decks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {decks.map((deck) => {
              const rememberedSlideNumber =
                lastViewedSlideByDeckId[deck.id] ??
                deck.slides[0]?.slideNumber ??
                1;
              const isSelected = selectedSource?.deckId === deck.id;

              return (
                <div
                  key={deck.id}
                  className={cn(
                    "group relative flex rounded-lg border transition-colors",
                    isSelected
                      ? "border-primary/25 bg-accent/70 shadow-sm"
                      : "border-border bg-card/70 hover:border-primary/20 hover:bg-card",
                  )}
                >
                  {isSelected ? (
                    <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-primary" />
                  ) : null}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-start gap-2 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() =>
                      onSelectSource({
                        deckId: deck.id,
                        slideNumber: rememberedSlideNumber,
                      })
                    }
                  >
                    <FileText
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-primary">
                        {deck.sourceLabel}
                      </span>
                      <span className="line-clamp-2 text-sm font-medium leading-5 text-foreground">
                        {deck.manifest.title}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {deck.manifest.language} · {deck.manifest.slide_count}{" "}
                        slide{deck.manifest.slide_count === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="m-1.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-100 transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                    aria-label={`Remove ${deck.manifest.title}`}
                    title="Remove source"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove "${deck.manifest.title}" from this browser?`,
                        )
                      ) {
                        void onRemoveDeck(deck.id);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-background/35 px-3 py-4 text-sm leading-6 text-muted-foreground">
            Upload one or more SIR files to create the current knowledge base.
          </p>
        )}

        {errors.length > 0 ? <ValidationIssues errors={errors} /> : null}
      </div>

      <SourceSearch
        query={searchQuery}
        resultCount={searchResultCount}
        results={searchResults}
        selectedSource={selectedSource}
        onQueryChange={onSearchQueryChange}
        onSelectSource={onSelectSource}
      />
      {isGenerateSirOpen ? (
        <GenerateSirDialog onClose={() => setIsGenerateSirOpen(false)} />
      ) : null}
    </aside>
  );
}

function GenerateSirDialog({ onClose }: { onClose: () => void }) {
  const [didCopy, setDidCopy] = useState(false);

  async function copyPrompt() {
    await navigator.clipboard.writeText(sirGenerationPrompt);
    setDidCopy(true);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm dark:bg-black/70"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-sir-title"
        className="flex max-h-[min(760px,calc(100dvh-2rem))] w-full max-w-2xl flex-col rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2
              id="generate-sir-title"
              className="text-base font-semibold text-foreground"
            >
              Generate SIR
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Use ChatGPT to compile PDF slide decks into AGN-compatible SIR
              files.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close Generate SIR"
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <ol className="space-y-2 text-sm leading-6 text-foreground/85">
            {sirGenerationWorkflowSteps.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-accent text-xs font-medium text-primary">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>

          <label
            htmlFor="sir-generation-prompt"
            className="mt-4 block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          >
            SIR compiler prompt
          </label>
          <textarea
            id="sir-generation-prompt"
            readOnly
            value={sirGenerationPrompt}
            className="mt-2 h-72 w-full resize-none rounded-xl border border-border bg-muted/55 px-3 py-2 font-mono text-xs leading-5 text-foreground outline-none focus-visible:border-primary/50 focus-visible:ring-3 focus-visible:ring-ring/20"
          />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            The prompt enforces the current SIR v1 structure.
          </p>
          <Button type="button" variant="secondary" onClick={copyPrompt}>
            {didCopy ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
            {didCopy ? "Copied" : "Copy prompt"}
          </Button>
        </footer>
      </section>
    </div>
  );
}

function ValidationIssues({ errors }: { errors: SirValidationError[] }) {
  return (
    <section
      className="mt-3 overflow-hidden rounded-xl border border-destructive/20 bg-destructive/[0.06]"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 border-b border-destructive/15 px-3 py-2.5 text-destructive">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-semibold">Couldn&apos;t import this source</h3>
          <p className="text-xs text-destructive/75">
            The archive doesn&apos;t match the SIR v1 format.
          </p>
        </div>
      </div>
      <ul className="max-h-48 divide-y divide-destructive/10 overflow-y-auto px-3">
        {errors.map((error, index) => (
          <li
            key={`${error.code}-${error.path ?? "archive"}-${index}`}
            className="min-w-0 py-2 text-xs leading-5 text-foreground/80"
          >
            {error.path ? (
              <span className="block break-words font-mono text-[11px] font-medium text-destructive [overflow-wrap:anywhere]">
                {error.path}
              </span>
            ) : null}
            <span className="block break-words [overflow-wrap:anywhere]">
              {error.message}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
