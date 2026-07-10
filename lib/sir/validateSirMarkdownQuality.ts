import type { SirValidationError } from "@/lib/sir/types";

const slideSectionPattern = /<!--\s*slide:\s*(\d+)\s*-->([\s\S]*?)(?=<!--\s*slide:|$)/g;
const forbiddenPlaceholderPatterns = [
  /struttura visiva rilevata/iu,
  /disposizione completa (?:è|e') conservata nell['’]immagine/iu,
  /(?:diagram|image|figura) (?:shown|mostrat[ao]|preservat[ao])(?:\s|$)/iu,
  /(?:see|vedi|consultare) (?:the |la |l['’])?(?:slide )?image/iu,
  /contenuto (?:non )?testuale trascritt[oa] e descritt[oa] dopo (?:la )?revisione visiva/iu,
  /(?:non-?textual )?content (?:was )?transcribed and described after visual review/iu,
];
const explicitBlankPattern =
  /(?:pagina|slide) (?:intenzionalmente |veramente )?(?:vuota|bianca)|(?:intentionally |truly )?blank (?:page|slide)/iu;
const minimumMeaningfulCharacters = 24;

export function validateSirMarkdownQuality(
  markdown: string,
): SirValidationError[] {
  const sections = Array.from(markdown.matchAll(slideSectionPattern));
  const placeholderSlides: number[] = [];
  const missingHeadingSlides: number[] = [];
  const sparseSlides: number[] = [];
  const suspectedOcrArtifactSlides: number[] = [];

  for (const match of sections) {
    const slideNumber = Number(match[1]);
    const content = match[2] ?? "";

    if (forbiddenPlaceholderPatterns.some((pattern) => pattern.test(content))) {
      placeholderSlides.push(slideNumber);
    }

    if (!/^#\s+\S.+$/mu.test(content)) {
      missingHeadingSlides.push(slideNumber);
    }

    if (containsSuspectedOcrArtifact(content)) {
      suspectedOcrArtifactSlides.push(slideNumber);
    }

    const meaningfulText = content
      .replace(/^#{1,6}\s+.*$/gmu, " ")
      .replace(/```/gu, " ")
      .replace(/[_*`>|#\-]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();

    if (
      meaningfulText.length < minimumMeaningfulCharacters &&
      !explicitBlankPattern.test(content)
    ) {
      sparseSlides.push(slideNumber);
    }
  }

  return [
    createAggregateError(
      placeholderSlides,
      "generic_visual_placeholder",
      "SIR v2 Markdown must transcribe visible content instead of using generic visual placeholders",
    ),
    createAggregateError(
      missingHeadingSlides,
      "missing_slide_heading",
      "Every SIR v2 slide must begin with a useful Markdown H1",
    ),
    createAggregateError(
      sparseSlides,
      "insufficient_slide_transcription",
      `Every non-blank SIR v2 slide needs at least ${minimumMeaningfulCharacters} characters of substantive content beyond its heading`,
    ),
    createAggregateError(
      suspectedOcrArtifactSlides,
      "suspected_ocr_artifact",
      "SIR v2 Markdown must not contain symbol-heavy OCR residue outside code blocks",
    ),
  ].filter((error): error is SirValidationError => error !== undefined);
}

function containsSuspectedOcrArtifact(content: string): boolean {
  const withoutCodeBlocks = content.replace(/```[\s\S]*?```/gu, "");

  return withoutCodeBlocks.split(/\r?\n/gu).some((line) => {
    const candidate = line.trim();

    if (
      candidate.length < 4 ||
      candidate.length > 20 ||
      /\s/u.test(candidate) ||
      /^#{1,6}(?:\s|$)/u.test(candidate) ||
      /^<!--/u.test(candidate) ||
      /^\([\dXx]+,[Nn\d.]+\)[.,;:]?$/u.test(candidate)
    ) {
      return false;
    }

    const alphaNumericCount = Array.from(candidate).filter((character) =>
      /[\p{L}\p{N}]/u.test(character),
    ).length;
    const symbolCount = candidate.length - alphaNumericCount;

    return (
      alphaNumericCount >= 1 &&
      alphaNumericCount <= 5 &&
      symbolCount / candidate.length >= 0.6
    );
  });
}

function createAggregateError(
  slideNumbers: number[],
  code: string,
  requirement: string,
): SirValidationError | undefined {
  if (slideNumbers.length === 0) {
    return undefined;
  }

  const sample = slideNumbers.slice(0, 12).join(", ");
  const remainder = slideNumbers.length > 12
    ? `, and ${slideNumbers.length - 12} more`
    : "";

  return {
    code,
    message: `${requirement}. Affected slides: ${sample}${remainder}.`,
    path: "sir.md",
  };
}
