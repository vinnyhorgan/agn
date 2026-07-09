import type { ParsedSirSlide } from "./types";

export const slideMarkerPattern = /<!--\s*slide:\s*(\d+)\s*-->/g;

export function extractSlideMarkers(markdown: string): number[] {
  return Array.from(markdown.matchAll(slideMarkerPattern), (match) =>
    Number(match[1]),
  );
}

export function parseSirMarkdown(markdown: string): ParsedSirSlide[] {
  const matches = Array.from(markdown.matchAll(slideMarkerPattern));

  return matches.map((match, index) => {
    const slideNumber = Number(match[1]);
    const markdownStart = (match.index ?? 0) + match[0].length;
    const nextMatch = matches[index + 1];
    const markdownEnd = nextMatch?.index ?? markdown.length;
    const slideMarkdown = markdown.slice(markdownStart, markdownEnd);
    const title = extractFirstH1(slideMarkdown);

    return {
      slideNumber,
      title,
      markdown: slideMarkdown,
    };
  });
}

function extractFirstH1(markdown: string): string | undefined {
  const h1Match = markdown.match(/^#\s+(.+?)\s*$/m);
  return h1Match?.[1]?.trim() || undefined;
}
