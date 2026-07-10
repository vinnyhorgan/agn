import type { ParsedSirSlide, ParsedSirSource } from "./types";

export const slideMarkerPattern = /<!--\s*slide:\s*(\d+)\s*-->/g;

export function extractSlideMarkers(markdown: string): number[] {
  return Array.from(markdown.matchAll(slideMarkerPattern), (match) =>
    Number(match[1]),
  );
}

export function parseSirMarkdown(
  markdown: string,
  sources: ParsedSirSource[] = [
    {
      sourceNumber: 1,
      title: "Untitled source",
      originalPath: "",
      mediaType: "sir-v1",
      language: "und",
      slideStart: 1,
      slideCount: Number.MAX_SAFE_INTEGER,
    },
  ],
): ParsedSirSlide[] {
  const matches = Array.from(markdown.matchAll(slideMarkerPattern));

  return matches.map((match, index) => {
    const slideNumber = Number(match[1]);
    const markdownStart = (match.index ?? 0) + match[0].length;
    const nextMatch = matches[index + 1];
    const markdownEnd = nextMatch?.index ?? markdown.length;
    const slideMarkdown = stripTrailingMarkdownRules(
      markdown.slice(markdownStart, markdownEnd),
    );
    const title = extractFirstH1(slideMarkdown);
    const source = findSlideSource(slideNumber, sources);

    return {
      slideNumber,
      sourceNumber: source.sourceNumber,
      sourceSlideNumber: slideNumber - source.slideStart + 1,
      title,
      markdown: slideMarkdown,
    };
  });
}

function findSlideSource(
  slideNumber: number,
  sources: ParsedSirSource[],
): ParsedSirSource {
  const source = sources.find(
    (candidate) =>
      slideNumber >= candidate.slideStart &&
      slideNumber < candidate.slideStart + candidate.slideCount,
  );

  if (!source) {
    throw new Error(`Slide ${slideNumber} does not map to a SIR source.`);
  }

  return source;
}

function stripTrailingMarkdownRules(markdown: string): string {
  const stripped = markdown.replace(
    /\n[ \t]{0,3}(?:-{3,}|\*{3,}|_{3,})[ \t]*(?:\r?\n)*$/,
    "\n",
  );

  return stripped === markdown ? markdown : stripped.replace(/\n+$/, "\n");
}

function extractFirstH1(markdown: string): string | undefined {
  const h1Match = markdown.match(/^#\s+(.+?)\s*$/m);
  return h1Match?.[1]?.trim() || undefined;
}
