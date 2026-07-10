"use client";

import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import type { BrowserSirDeck, SelectedSource } from "@/components/sources/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SourceChunk } from "@/lib/search/types";

interface SourcePreviewProps {
  decks: BrowserSirDeck[];
  sourceChunks: SourceChunk[];
  selectedSource?: SelectedSource;
  onSelectSource: (source: SelectedSource) => void;
}

export function SourcePreview({
  decks,
  sourceChunks,
  selectedSource,
  onSelectSource,
}: SourcePreviewProps) {
  const [isImageOpen, setIsImageOpen] = useState(false);
  const deck = selectedSource
    ? decks.find((candidate) => candidate.id === selectedSource.deckId)
    : undefined;
  const slide =
    deck?.slides.find(
      (candidate) => candidate.slideNumber === selectedSource?.slideNumber,
    ) ?? deck?.slides[0];
  const selectedChunk =
    selectedSource?.chunkId !== undefined
      ? sourceChunks.find((chunk) => chunk.id === selectedSource.chunkId)
      : undefined;
  const slideIndex =
    deck && slide
      ? deck.slides.findIndex(
          (candidate) => candidate.slideNumber === slide.slideNumber,
        )
      : -1;
  const isFirstSlide = slideIndex <= 0;
  const isLastSlide = deck ? slideIndex >= deck.slides.length - 1 : true;
  const chunk = selectedChunk;
  const imageUrl = slide
    ? deck?.imageUrlsBySlideNumber[slide.slideNumber]
    : undefined;

  function selectSlideByOffset(offset: number) {
    if (!deck || slideIndex < 0) {
      return;
    }

    const nextSlide = deck.slides[slideIndex + offset];

    if (!nextSlide) {
      return;
    }

    onSelectSource({
      deckId: deck.id,
      slideNumber: nextSlide.slideNumber,
    });
  }

  useEffect(() => {
    if (!isImageOpen) {
      return;
    }

    function handleFullscreenKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsImageOpen(false);
        return;
      }

      const offset = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;

      if (offset === 0 || !deck || slideIndex < 0) {
        return;
      }

      const nextSlide = deck.slides[slideIndex + offset];

      if (nextSlide) {
        event.preventDefault();
        onSelectSource({
          deckId: deck.id,
          slideNumber: nextSlide.slideNumber,
        });
      }
    }

    document.addEventListener("keydown", handleFullscreenKeyDown);
    return () => document.removeEventListener("keydown", handleFullscreenKeyDown);
  }, [deck, isImageOpen, onSelectSource, slideIndex]);

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-border px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground">
            Source preview
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            Inspect cited slides and retrieved chunks.
          </p>
        </div>
        <div className="lg:hidden">
          <ThemeToggle />
        </div>
      </header>

      {!selectedSource || !deck || !slide ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div>
            <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
              <BookOpen className="size-5 text-primary" aria-hidden="true" />
            </div>
            <h3 className="text-sm font-medium text-foreground">
              No source selected
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Select a search result, retrieved source, or citation to inspect
              the supporting slide.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{deck.sourceLabel}</Badge>
            <Badge variant="outline" className="border-border text-muted-foreground">
              Slide {slide.slideNumber}
            </Badge>
          </div>

          <h3 className="mt-3 text-base font-semibold leading-6 text-foreground">
            {deck.manifest.title}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {slide.title ?? "Untitled slide"}
          </p>

          <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-border bg-card/70 px-2 py-2 shadow-sm">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isFirstSlide}
              onClick={() => selectSlideByOffset(-1)}
            >
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
            <p className="shrink-0 text-xs font-medium text-muted-foreground">
              Slide {slide.slideNumber} / {deck.manifest.slide_count}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isLastSlide}
              onClick={() => selectSlideByOffset(1)}
            >
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>

          <section className="mt-4 overflow-hidden rounded-xl border border-border bg-muted/55 p-2 shadow-inner">
            {imageUrl ? (
              <button
                type="button"
                className="group relative block w-full cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Enlarge slide ${slide.slideNumber}`}
                onClick={() => setIsImageOpen(true)}
              >
                {/* Object URLs cannot use Next image optimization. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imageUrl}
                  alt={`Slide ${slide.slideNumber} from ${deck.manifest.title}`}
                  className="max-h-[42dvh] w-full rounded-md object-contain"
                />
                <span className="absolute bottom-2 right-2 flex size-7 items-center justify-center rounded-md border border-white/10 bg-black/70 text-white/90 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <Maximize2 className="size-3.5" aria-hidden="true" />
                </span>
              </button>
            ) : (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No image preview is available for this slide.
              </p>
            )}
          </section>

          {chunk ? (
            <section className="mt-4 rounded-xl border border-primary/15 bg-accent/55 px-3 py-2.5">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
                Retrieved chunk
              </h4>
              {chunk.headingPath?.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {chunk.headingPath.join(" / ")}
                </p>
              ) : null}
              <p className="mt-2 text-sm leading-6 text-foreground/90">
                {chunk.text}
              </p>
            </section>
          ) : null}

          <section className="mt-4">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Slide Markdown
            </h4>
            <div className="rounded-xl border border-border bg-card/60 px-3 py-2">
              <MarkdownContent markdown={slide.markdown} />
            </div>
          </section>
        </div>
      )}
      {isImageOpen && imageUrl && deck && slide ? (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/95 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Slide ${slide.slideNumber} image`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsImageOpen(false);
            }
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3 text-sm text-white/80">
            <div className="min-w-0">
              <p className="truncate">{deck.manifest.title}</p>
              <p className="text-xs text-white/50">
                Slide {slide.slideNumber} of {deck.manifest.slide_count}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close enlarged slide"
              onClick={() => setIsImageOpen(false)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center">
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              className="absolute left-1 z-10 rounded-full border border-white/15 bg-black/55 text-white shadow-xl backdrop-blur-md hover:bg-black/75 disabled:invisible sm:left-3"
              disabled={isFirstSlide}
              aria-label="Previous slide"
              onClick={() => selectSlideByOffset(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={`Slide ${slide.slideNumber} from ${deck.manifest.title}`}
              className="max-h-full max-w-full object-contain"
            />
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              className="absolute right-1 z-10 rounded-full border border-white/15 bg-black/55 text-white shadow-xl backdrop-blur-md hover:bg-black/75 disabled:invisible sm:right-3"
              disabled={isLastSlide}
              aria-label="Next slide"
              onClick={() => selectSlideByOffset(1)}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function MarkdownContent({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <p className="text-sm text-muted-foreground">This slide has no Markdown.</p>;
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mb-3 text-lg font-semibold leading-tight text-foreground">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-4 text-base font-semibold leading-tight text-foreground">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-3 text-sm font-semibold leading-tight text-foreground">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="mb-3 text-sm leading-6 text-foreground/85">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-6 text-foreground/85 marker:text-primary">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-foreground/85 marker:text-primary">
            {children}
          </ol>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-3 border-l-2 border-primary pl-3 text-sm leading-6 text-muted-foreground">
            {children}
          </blockquote>
        ),
        hr: () => null,
        code: ({ children }) => (
          <code className="rounded bg-accent px-1 py-0.5 font-mono text-sm text-accent-foreground">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-3 overflow-x-auto rounded-xl bg-foreground p-3 text-sm leading-6 text-background">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm text-foreground/85">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-border bg-muted px-2 py-1 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-border px-2 py-1">{children}</td>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
