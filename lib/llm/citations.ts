import type { SourceChunk } from "@/lib/search/types";

const qualifiedCitationPattern = /\[Source\s+(\d+)\s*,\s*Slide\s+(\d+)\]/gi;
const legacyCitationPattern = /\[Slide\s+(\d+)\]/gi;
const rangedCitationPattern = /\[Source\s+(\d+)\s*,\s*Slides?\s+(\d+)\s*[-–—]\s*(\d+)\]/gi;
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

  const expandedRanges = content.replace(
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
