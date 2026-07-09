import { Search } from "lucide-react";

import type { SearchResult } from "@/lib/search/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SourceSearchProps {
  query: string;
  resultCount: number;
  results: SearchResult[];
  selectedSlideNumber: number;
  onQueryChange: (query: string) => void;
  onSelectSlide: (slideNumber: number) => void;
}

export function SourceSearch({
  query,
  resultCount,
  results,
  selectedSlideNumber,
  onQueryChange,
  onSelectSlide,
}: SourceSearchProps) {
  const trimmedQuery = query.trim();

  return (
    <Card className="rounded-lg bg-white">
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Search Sources</CardTitle>
          {trimmedQuery ? (
            <Badge variant="outline">
              {resultCount} result{resultCount === 1 ? "" : "s"}
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
            placeholder="Search this deck"
            className="pl-8"
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <span className="sr-only">Search this deck</span>
        </label>
      </CardHeader>
      <CardContent>
        {!trimmedQuery ? (
          <p className="text-sm leading-6 text-zinc-600">
            No search query.
          </p>
        ) : results.length > 0 ? (
          <ScrollArea className="h-[300px] pr-3">
            <div className="flex flex-col gap-2">
              {results.map((result) => {
                const isSelected =
                  result.chunk.slideNumber === selectedSlideNumber;

                return (
                  <Button
                    key={result.chunk.id}
                    type="button"
                    variant="ghost"
                    className={cn(
                      "h-auto w-full justify-start whitespace-normal rounded-lg border px-3 py-2 text-left",
                      isSelected
                        ? "border-zinc-950 bg-zinc-100 text-zinc-950"
                        : "border-zinc-200 text-zinc-700",
                    )}
                    onClick={() => onSelectSlide(result.chunk.slideNumber)}
                  >
                    <span className="flex min-w-0 flex-col items-start gap-1">
                      <span className="text-xs font-medium text-zinc-500">
                        Slide {result.chunk.slideNumber}
                      </span>
                      <span className="line-clamp-1 text-sm font-medium text-zinc-950">
                        {result.chunk.slideTitle ?? "Untitled slide"}
                      </span>
                      {result.chunk.headingPath?.length ? (
                        <span className="line-clamp-1 text-xs text-zinc-500">
                          {result.chunk.headingPath.join(" / ")}
                        </span>
                      ) : null}
                      <span className="line-clamp-3 text-sm leading-6 text-zinc-700">
                        {result.snippet}
                      </span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-sm leading-6 text-zinc-600">
            No matching source chunks in this deck.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
