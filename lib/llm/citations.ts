import type { SourceChunk } from "@/lib/search/types";

const qualifiedCitationPattern = /\[Source\s+(\d+)\s*,\s*Slide\s+(\d+)\]/gi;
const legacyCitationPattern = /\[Slide\s+(\d+)\]/gi;
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

  const normalizedGroups = content.replace(groupedCitationPattern, (_, group: string) =>
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
