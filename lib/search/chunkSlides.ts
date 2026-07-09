import type { ParsedSirFile, ParsedSirSlide } from "@/lib/sir/types";
import type { SourceChunk } from "@/lib/search/types";

const maxChunkCharacters = 900;
const headingPattern = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

interface SlideSection {
  headingPath: string[];
  lines: string[];
}

interface MarkdownHeading {
  level: number;
  text: string;
}

export function chunkSlides(deck: ParsedSirFile): SourceChunk[] {
  const chunks: SourceChunk[] = [];

  for (const slide of deck.slides) {
    const slideImagePath = getSlideImagePath(deck, slide.slideNumber);
    const slideChunks = chunkSlide(deck.manifest.title, slide, slideImagePath);
    chunks.push(...slideChunks);
  }

  return chunks;
}

function chunkSlide(
  deckTitle: string,
  slide: ParsedSirSlide,
  slideImagePath: string,
): SourceChunk[] {
  const sections = splitSlideIntoSections(slide);
  const splitByHeading = sections.length > 0;
  const sourceTexts = splitByHeading
    ? sections.flatMap((section) =>
        splitLargeText(
          buildChunkText(slide.title, section.headingPath, section.lines),
        ).map((text) => ({
          headingPath: section.headingPath,
          text,
        })),
      )
    : splitLargeText(buildChunkText(slide.title, undefined, [slide.markdown])).map(
        (text) => ({
          headingPath: undefined,
          text,
        }),
      );

  return sourceTexts
    .map((sourceText, index) => ({
      id: `slide-${slide.slideNumber}-chunk-${index + 1}`,
      deckTitle,
      slideNumber: slide.slideNumber,
      slideTitle: slide.title,
      headingPath: sourceText.headingPath,
      text: sourceText.text,
      slideImagePath,
    }))
    .filter((chunk) => chunk.text.length > 0);
}

function splitSlideIntoSections(slide: ParsedSirSlide): SlideSection[] {
  const lines = slide.markdown.replace(/\r\n/g, "\n").split("\n");
  const headingStack: MarkdownHeading[] = [];
  const sections: SlideSection[] = [];
  let currentLines: string[] = [];
  let currentHeadingPath: string[] = [];
  let sawSubheading = false;

  for (const line of lines) {
    const heading = parseHeading(line);

    if (!heading) {
      currentLines.push(line);
      continue;
    }

    flushSection(sections, currentHeadingPath, currentLines);
    currentLines = [line];

    while (
      headingStack.length > 0 &&
      headingStack[headingStack.length - 1]!.level >= heading.level
    ) {
      headingStack.pop();
    }

    headingStack.push(heading);
    currentHeadingPath = headingStack.map((item) => item.text);

    if (heading.level > 1 || heading.text !== slide.title) {
      sawSubheading = true;
    }
  }

  flushSection(sections, currentHeadingPath, currentLines);

  if (!sawSubheading) {
    return [];
  }

  return sections;
}

function flushSection(
  sections: SlideSection[],
  headingPath: string[],
  lines: string[],
) {
  const text = stripMarkdown(lines.join("\n"));

  if (!text) {
    return;
  }

  sections.push({
    headingPath,
    lines,
  });
}

function buildChunkText(
  slideTitle: string | undefined,
  headingPath: string[] | undefined,
  lines: string[],
): string {
  const contextParts = [
    slideTitle,
    ...(headingPath?.filter((heading) => heading !== slideTitle) ?? []),
  ].filter((part): part is string => Boolean(part));
  let bodyText = stripMarkdown(lines.join("\n"));

  for (const contextPart of contextParts) {
    if (bodyText === contextPart) {
      bodyText = "";
      break;
    }

    if (bodyText.startsWith(`${contextPart} `)) {
      bodyText = bodyText.slice(contextPart.length).trim();
    }
  }

  const parts = [
    slideTitle,
    headingPath?.filter((heading) => heading !== slideTitle).join(" > "),
    bodyText,
  ];

  return collapseWhitespace(parts.filter(Boolean).join("\n"));
}

function splitLargeText(text: string): string[] {
  const normalized = collapseWhitespace(text);

  if (!normalized) {
    return [];
  }

  if (normalized.length <= maxChunkCharacters) {
    return [normalized];
  }

  const sentences = normalized.match(/[^.!?]+[.!?]+|\S[\s\S]*$/g) ?? [normalized];
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const trimmed = sentence.trim();

    if (!trimmed) {
      continue;
    }

    if (!current) {
      current = trimmed;
      continue;
    }

    if (`${current} ${trimmed}`.length <= maxChunkCharacters) {
      current = `${current} ${trimmed}`;
      continue;
    }

    chunks.push(current);
    current = trimmed;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks.flatMap(splitOversizedChunk);
}

function splitOversizedChunk(text: string): string[] {
  if (text.length <= maxChunkCharacters) {
    return [text];
  }

  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= maxChunkCharacters) {
      current = `${current} ${word}`;
      continue;
    }

    chunks.push(current);
    current = word;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function parseHeading(line: string): MarkdownHeading | undefined {
  const match = line.match(headingPattern);

  if (!match) {
    return undefined;
  }

  return {
    level: match[1]!.length,
    text: stripMarkdown(match[2]!),
  };
}

function stripMarkdown(markdown: string): string {
  return collapseWhitespace(
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/^>\s?/gm, "")
      .replace(/^[\s>*+-]*\[[ xX]\]\s+/gm, "")
      .replace(/^[\s>*+-]+/gm, "")
      .replace(/^\s*\d+[.)]\s+/gm, "")
      .replace(/[*_~]/g, " ")
      .replace(/\|/g, " "),
  );
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function getSlideImagePath(deck: ParsedSirFile, slideNumber: number): string {
  const expectedPath = `slides/${String(slideNumber).padStart(4, "0")}.webp`;
  return deck.imagePaths.find((imagePath) => imagePath === expectedPath) ?? expectedPath;
}
