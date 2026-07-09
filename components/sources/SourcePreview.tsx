"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { BrowserSirDeck, SelectedSource } from "@/components/sources/types";
import { Badge } from "@/components/ui/badge";
import type { SourceChunk } from "@/lib/search/types";

interface SourcePreviewProps {
  decks: BrowserSirDeck[];
  sourceChunks: SourceChunk[];
  selectedSource?: SelectedSource;
}

export function SourcePreview({
  decks,
  sourceChunks,
  selectedSource,
}: SourcePreviewProps) {
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
  const fallbackChunk = slide
    ? sourceChunks.find(
        (chunk) =>
          chunk.deckId === deck?.id && chunk.slideNumber === slide.slideNumber,
      )
    : undefined;
  const chunk = selectedChunk ?? fallbackChunk;
  const imageUrl = slide
    ? deck?.imageUrlsBySlideNumber[slide.slideNumber]
    : undefined;

  return (
    <aside className="flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950">
      <header className="flex min-h-14 items-center border-b border-zinc-800 px-4">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-zinc-50">
            Source preview
          </h2>
          <p className="truncate text-xs text-zinc-500">
            Inspect cited slides and retrieved chunks.
          </p>
        </div>
      </header>

      {!selectedSource || !deck || !slide ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <div>
            <h3 className="text-sm font-medium text-zinc-100">
              No source selected
            </h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Select a search result, retrieved source, or citation to inspect
              the supporting slide.
            </p>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{deck.sourceLabel}</Badge>
            <Badge variant="outline" className="border-zinc-800 text-zinc-300">
              Slide {slide.slideNumber}
            </Badge>
          </div>

          <h3 className="mt-3 text-base font-semibold leading-6 text-zinc-50">
            {deck.manifest.title}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            {slide.title ?? "Untitled slide"}
          </p>

          <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 p-2">
            {imageUrl ? (
              // Object URLs are created in browser state and are not compatible
              // with Next image optimization.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt={`Slide ${slide.slideNumber} from ${deck.manifest.title}`}
                className="max-h-56 w-full rounded-md object-contain"
              />
            ) : (
              <p className="px-3 py-8 text-center text-sm text-zinc-500">
                No image preview is available for this slide.
              </p>
            )}
          </section>

          {chunk ? (
            <section className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
              <h4 className="text-xs font-semibold uppercase tracking-normal text-zinc-500">
                Retrieved chunk
              </h4>
              {chunk.headingPath?.length ? (
                <p className="mt-1 text-xs text-zinc-500">
                  {chunk.headingPath.join(" / ")}
                </p>
              ) : null}
              <p className="mt-2 text-sm leading-6 text-zinc-200">
                {chunk.text}
              </p>
            </section>
          ) : null}

          <section className="mt-4">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-normal text-zinc-500">
              Slide Markdown
            </h4>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
              <MarkdownContent markdown={slide.markdown} />
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}

function MarkdownContent({ markdown }: { markdown: string }) {
  if (!markdown.trim()) {
    return <p className="text-sm text-zinc-500">This slide has no Markdown.</p>;
  }

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="mb-3 text-lg font-semibold leading-tight text-zinc-50">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-4 text-base font-semibold leading-tight text-zinc-100">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-3 text-sm font-semibold leading-tight text-zinc-100">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="mb-3 text-sm leading-6 text-zinc-300">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-6 text-zinc-300">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-6 text-zinc-300">
            {children}
          </ol>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-3 border-l-2 border-zinc-700 pl-3 text-sm leading-6 text-zinc-400">
            {children}
          </blockquote>
        ),
        code: ({ children }) => (
          <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-sm text-zinc-100">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="mb-3 overflow-x-auto rounded-lg bg-black p-3 text-sm leading-6 text-zinc-100">
            {children}
          </pre>
        ),
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm text-zinc-300">
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border border-zinc-800 bg-zinc-900 px-2 py-1 text-left font-medium">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="border border-zinc-800 px-2 py-1">{children}</td>
        ),
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
