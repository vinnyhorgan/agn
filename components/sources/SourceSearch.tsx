"use client";

import { Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SelectedSource } from "@/components/sources/types";
import type { SearchResult } from "@/lib/search/types";
import { cn } from "@/lib/utils";

interface SourceSearchProps {
  query: string;
  resultCount: number;
  results: SearchResult[];
  selectedSource?: SelectedSource;
  onQueryChange: (query: string) => void;
  onSelectSource: (source: SelectedSource) => void;
}

export function SourceSearch({
  query,
  resultCount,
  results,
  selectedSource,
  onQueryChange,
  onSelectSource,
}: SourceSearchProps) {
  const trimmedQuery = query.trim();

  return (
    <section className="flex min-h-0 flex-1 flex-col border-t border-zinc-800 px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
          Search
        </h2>
        {trimmedQuery ? (
          <Badge variant="outline" className="border-zinc-800 text-zinc-400">
            {resultCount}
          </Badge>
        ) : null}
      </div>
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-zinc-500"
          aria-hidden="true"
        />
        <Input
          value={query}
          placeholder="Search slides"
          className="border-zinc-800 bg-zinc-900 pl-8 text-zinc-100"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <span className="sr-only">Search uploaded sources</span>
      </label>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {!trimmedQuery ? (
          <p className="text-sm leading-6 text-zinc-500">
            Search slide titles and text across your local library.
          </p>
        ) : results.length > 0 ? (
          <div className="flex flex-col gap-2">
            {results.map((result) => {
              const isSelected =
                selectedSource?.deckId === result.chunk.deckId &&
                selectedSource.slideNumber === result.chunk.slideNumber &&
                (!selectedSource.chunkId ||
                  selectedSource.chunkId === result.chunk.id);

              return (
                <Button
                  key={result.chunk.id}
                  type="button"
                  variant="ghost"
                  className={cn(
                    "h-auto w-full justify-start whitespace-normal rounded-lg border px-3 py-2 text-left",
                    isSelected
                      ? "border-zinc-500 bg-zinc-800 text-zinc-100"
                      : "border-zinc-800 text-zinc-300 hover:bg-zinc-900",
                  )}
                  onClick={() =>
                    onSelectSource({
                      deckId: result.chunk.deckId,
                      slideNumber: result.chunk.slideNumber,
                      chunkId: result.chunk.id,
                    })
                  }
                >
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    <span className="line-clamp-1 text-xs font-medium text-zinc-500">
                      {result.chunk.sourceLabel
                        ? `${result.chunk.sourceLabel} · `
                        : ""}
                      {result.chunk.deckTitle}
                    </span>
                    <span className="line-clamp-1 text-sm font-medium text-zinc-100">
                      Slide {result.chunk.slideNumber}
                      {result.chunk.slideTitle
                        ? ` · ${result.chunk.slideTitle}`
                        : ""}
                    </span>
                    <span className="line-clamp-3 text-xs leading-5 text-zinc-400">
                      {result.snippet}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-zinc-500">
            No matching slides.
          </p>
        )}
      </div>
    </section>
  );
}
