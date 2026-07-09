import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ParsedSirSlide } from "@/lib/sir/types";

interface SlideViewerProps {
  slide: ParsedSirSlide;
  imageUrl?: string;
}

export function SlideViewer({ slide, imageUrl }: SlideViewerProps) {
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <p className="text-sm font-medium text-zinc-500">
          Slide {slide.slideNumber}
        </p>
        <h2 className="text-xl font-semibold text-zinc-950">
          {slide.title ?? "Untitled slide"}
        </h2>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
        <section className="min-w-0 rounded-lg border border-zinc-200 bg-white p-4">
          {slide.markdown.trim() ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-3 text-2xl font-semibold leading-tight text-zinc-950">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mb-2 mt-5 text-xl font-semibold leading-tight text-zinc-950">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mb-2 mt-4 text-lg font-semibold leading-tight text-zinc-950">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="mb-3 text-sm leading-7 text-zinc-700">
                    {children}
                  </p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-3 list-disc space-y-1 pl-5 text-sm leading-7 text-zinc-700">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-7 text-zinc-700">
                    {children}
                  </ol>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="mb-3 border-l-2 border-zinc-300 pl-3 text-sm leading-7 text-zinc-600">
                    {children}
                  </blockquote>
                ),
                code: ({ children }) => (
                  <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-sm text-zinc-900">
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre className="mb-3 overflow-x-auto rounded-lg bg-zinc-950 p-3 text-sm leading-6 text-zinc-50">
                    {children}
                  </pre>
                ),
                table: ({ children }) => (
                  <div className="mb-3 overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-left font-medium">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-zinc-200 px-2 py-1">
                    {children}
                  </td>
                ),
              }}
            >
              {slide.markdown}
            </ReactMarkdown>
          ) : (
            <p className="text-sm text-zinc-600">
              This slide has no Markdown content.
            </p>
          )}
        </section>

        <section className="flex min-h-[360px] items-center justify-center rounded-lg border border-zinc-200 bg-zinc-100 p-3">
          {imageUrl ? (
            // Object URLs are created in browser state and are not compatible
            // with Next image optimization.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={`Slide ${slide.slideNumber} image`}
              className="max-h-[72vh] w-full rounded-md object-contain"
            />
          ) : (
            <p className="text-sm text-zinc-600">
              No image preview is available for this slide.
            </p>
          )}
        </section>
      </div>
    </article>
  );
}
