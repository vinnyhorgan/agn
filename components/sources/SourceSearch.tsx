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
    <section className="flex max-h-1/2 min-h-0 shrink-0 flex-col border-t border-border px-3 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Search
        </h2>
        {trimmedQuery ? (
          <Badge variant="outline" className="border-border text-muted-foreground">
            {resultCount}
          </Badge>
        ) : null}
      </div>
      <label className="relative block">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          placeholder="Search slides"
          className="border-border bg-background/65 pl-8 text-foreground shadow-none focus-visible:border-primary/45 focus-visible:ring-ring/20"
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <span className="sr-only">Search uploaded sources</span>
      </label>

      <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
        {!trimmedQuery ? (
          <p className="text-sm leading-6 text-muted-foreground">
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
                      ? "border-primary/30 bg-accent/70 text-foreground"
                      : "border-border bg-card/50 text-foreground/85 hover:border-primary/20 hover:bg-card",
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
                    <span className="line-clamp-1 text-xs font-medium text-primary">
                      {result.chunk.sourceLabel
                        ? `${result.chunk.sourceLabel} · `
                        : ""}
                      {result.chunk.sourceTitle}
                    </span>
                    <span className="line-clamp-1 text-sm font-medium text-foreground">
                      Slide {result.chunk.sourceSlideNumber}
                      {result.chunk.slideTitle
                        ? ` · ${result.chunk.slideTitle}`
                        : ""}
                    </span>
                    <span className="line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {result.snippet}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm leading-6 text-muted-foreground">
            No matching slides.
          </p>
        )}
      </div>
    </section>
  );
}
