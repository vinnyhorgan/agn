"use client";

import { FileText, Loader2, Upload } from "lucide-react";
import { useRef } from "react";

import { SourceSearch } from "@/components/sources/SourceSearch";
import type { BrowserSirDeck, SelectedSource } from "@/components/sources/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SearchResult } from "@/lib/search/types";
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
  onUploadFiles: (files: FileList | null) => void;
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
  onUploadFiles,
  onSearchQueryChange,
  onSelectSource,
}: SourceSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    onUploadFiles(event.target.files);
    event.target.value = "";
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-zinc-800 bg-zinc-950">
      <div className="border-b border-zinc-800 px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-semibold text-zinc-50">AGN</p>
            <p className="text-xs text-zinc-500">Actually-Good-Notebook</p>
          </div>
          <Badge variant="outline" className="border-zinc-800 text-zinc-400">
            SIR
          </Badge>
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
        <Button
          type="button"
          variant="secondary"
          className="mt-4 w-full"
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
      </div>

      <div className="min-h-0 overflow-y-auto px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
            Sources
          </h2>
          <Badge variant="outline" className="border-zinc-800 text-zinc-400">
            {decks.length}
          </Badge>
        </div>
        {decks.length > 0 ? (
          <div className="flex flex-col gap-2">
            {decks.map((deck) => {
              const firstSlideNumber = deck.slides[0]?.slideNumber ?? 1;
              const isSelected = selectedSource?.deckId === deck.id;

              return (
                <button
                  key={deck.id}
                  type="button"
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "border-zinc-500 bg-zinc-900"
                      : "border-zinc-800 bg-zinc-950 hover:bg-zinc-900",
                  )}
                  onClick={() =>
                    onSelectSource({
                      deckId: deck.id,
                      slideNumber: firstSlideNumber,
                    })
                  }
                >
                  <span className="flex items-start gap-2">
                    <FileText
                      className="mt-0.5 size-4 shrink-0 text-zinc-500"
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-zinc-500">
                        {deck.sourceLabel}
                      </span>
                      <span className="line-clamp-2 text-sm font-medium leading-5 text-zinc-100">
                        {deck.manifest.title}
                      </span>
                      <span className="mt-1 block text-xs text-zinc-500">
                        {deck.manifest.language} · {deck.manifest.slide_count}{" "}
                        slide{deck.manifest.slide_count === 1 ? "" : "s"}
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-sm leading-6 text-zinc-500">
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
    </aside>
  );
}

function ValidationIssues({ errors }: { errors: SirValidationError[] }) {
  return (
    <section className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
      <h3 className="text-sm font-medium text-destructive">
        Validation issues
      </h3>
      <ul className="mt-2 space-y-1 text-xs leading-5 text-red-200">
        {errors.map((error, index) => (
          <li key={`${error.code}-${error.path ?? "archive"}-${index}`}>
            {error.path ? (
              <span className="font-medium">{error.path}: </span>
            ) : null}
            {error.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
