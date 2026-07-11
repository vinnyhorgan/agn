import type { SourceChunk } from "@/lib/search/types";

const qualifiedCitationPattern = /\[Source\s+(\d+)\s*,\s*Slide\s+(\d+)\]/gi;
const legacyCitationPattern = /\[Slide\s+(\d+)\]/gi;
const rangedCitationPattern = /\[Source\s+(\d+)\s*,\s*Slides?\s+(\d+)\s*[-–—]\s*(\d+)\]/gi;
const listedCitationPattern = /\[Source\s+(\d+)\s*,\s*Slides\s+([\d\s,]+)\]/gi;
const compoundCitationPattern = /\[Source\s+(\d+)\s*,\s*Slides?\s+([\d\s,–—-]+)\]/gi;
const sourceOnlyCitationPattern = /\[Source\s+\d+\]/gi;
const groupedCitationPattern =
  /\[((?:Source\s+\d+\s*,\s*Slide\s+\d+)(?:\s*;\s*Source\s+\d+\s*,\s*Slide\s+\d+)+)\]/gi;

export function repairModelCitations(
  content: string,
  sources: SourceChunk[],
): string {
  const validQualified = new Set(
    sources.map(
      (source) =>
        `${normalizeSourceLabel(source.sourceLabel)},${source.sourceSlideNumber}`,
    ),
  );

  const expandedCompounds = content.replace(
    compoundCitationPattern,
    (_citation, sourceNumberText: string, expression: string) => {
      const sourceNumber = Number(sourceNumberText);
      const slides = expression.split(",").flatMap((part) => {
        const range = part.trim().match(/^(\d+)\s*[-–—]\s*(\d+)$/);
        if (!range) return [Number(part.trim())];
        const start = Number(range[1]);
        const end = Number(range[2]);
        return end >= start && end - start <= 20
          ? Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
          : [];
      });
      return slides
        .filter((slide) => Number.isInteger(slide) && validQualified.has(`source ${sourceNumber},${slide}`))
        .map((slide) => `[Source ${sourceNumber}, Slide ${slide}]`)
        .join(" ");
    },
  );
  const expandedLists = expandedCompounds.replace(
    listedCitationPattern,
    (_citation, sourceNumberText: string, slidesText: string) =>
      slidesText
        .split(",")
        .map(Number)
        .filter((slide) => Number.isInteger(slide) && validQualified.has(`source ${Number(sourceNumberText)},${slide}`))
        .map((slide) => `[Source ${Number(sourceNumberText)}, Slide ${slide}]`)
        .join(" "),
  );
  const expandedRanges = expandedLists.replace(
    rangedCitationPattern,
    (_citation, sourceNumberText: string, startText: string, endText: string) => {
      const sourceNumber = Number(sourceNumberText);
      const start = Number(startText);
      const end = Number(endText);
      if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 20) return "";
      return Array.from({ length: end - start + 1 }, (_, offset) => start + offset)
        .filter((slide) => validQualified.has(`source ${sourceNumber},${slide}`))
        .map((slide) => `[Source ${sourceNumber}, Slide ${slide}]`)
        .join(" ");
    },
  );
  const normalizedGroups = expandedRanges.replace(groupedCitationPattern, (_, group: string) =>
    group
      .split(/\s*;\s*/)
      .map((citation) => `[${citation}]`)
      .join(" "),
  );
  const repairedQualified = normalizedGroups.replace(
    qualifiedCitationPattern,
    (citation, sourceNumber: string, slideNumber: string) =>
      validQualified.has(`source ${Number(sourceNumber)},${Number(slideNumber)}`)
        ? citation
        : "",
  );

  return repairedQualified
    .replace(sourceOnlyCitationPattern, "")
    .replace(legacyCitationPattern, (citation, slideNumber: string) => {
      const matchingSources = uniqueSourceLabels(
        sources.filter(
          (source) => source.sourceSlideNumber === Number(slideNumber),
        ),
      );

      if (matchingSources.length !== 1) {
        return "";
      }

      return `[${matchingSources[0]}, Slide ${Number(slideNumber)}]`;
    })
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeSourceLabel(sourceLabel?: string): string {
  return (sourceLabel ?? "Source 1").trim().toLocaleLowerCase();
}

function uniqueSourceLabels(sources: SourceChunk[]): string[] {
  return Array.from(
    new Set(sources.map((source) => source.sourceLabel ?? "Source 1")),
  );
}
