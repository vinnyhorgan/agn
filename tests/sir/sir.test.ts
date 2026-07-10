import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import { chunkSlides } from "../../lib/search/chunkSlides";
import { parseSirFile } from "../../lib/sir/importSir";
import { parseSirMarkdown } from "../../lib/sir/parseSirMarkdown";
import { validateSirFile } from "../../lib/sir/validateSir";

describe("SIR v1 validation", () => {
  it("accepts a valid minimal 2-slide SIR", async () => {
    const input = await createSirArchive();

    const result = await validateSirFile(input);

    expect(result.valid).toBe(true);
    if (!result.valid) {
      throw new Error("Expected valid result");
    }

    expect(result.manifest).toEqual({
      sir: 1,
      title: "Example Deck",
      language: "en",
      slide_count: 2,
    });
    expect(result.slideMarkers).toEqual([1, 2]);
    expect(result.imagePaths).toEqual(["slides/0001.webp", "slides/0002.webp"]);
  });

  it("rejects a missing manifest", async () => {
    const input = await createSirArchive({ includeManifest: false });

    const result = await validateSirFile(input);

    expectErrorCode(result, "missing_manifest");
  });

  it("rejects a missing sir.md", async () => {
    const input = await createSirArchive({ includeMarkdown: false });

    const result = await validateSirFile(input);

    expectErrorCode(result, "missing_sir_markdown");
  });

  it("rejects an extra root file", async () => {
    const input = await createSirArchive({ extraRootFiles: ["notes.txt"] });

    const result = await validateSirFile(input);

    expectErrorCode(result, "unexpected_root_entry");
  });

  it("rejects an extra manifest field", async () => {
    const input = await createSirArchive({
      manifest: {
        sir: 1,
        title: "Example Deck",
        language: "en",
        slide_count: 2,
        author: "Ada",
      },
    });

    const result = await validateSirFile(input);

    expectErrorCode(result, "unexpected_manifest_field");
  });

  it("rejects non-consecutive slide markers", async () => {
    const input = await createSirArchive({
      markdown: `
<!-- slide: 1 -->
# One
<!-- slide: 3 -->
# Three
`,
    });

    const result = await validateSirFile(input);

    expectErrorCode(result, "non_consecutive_slide_markers");
  });

  it("rejects slide_count mismatch", async () => {
    const input = await createSirArchive({
      manifest: {
        sir: 1,
        title: "Example Deck",
        language: "en",
        slide_count: 3,
      },
    });

    const result = await validateSirFile(input);

    expectErrorCode(result, "slide_marker_count_mismatch");
  });

  it("rejects an unreasonable slide count before allocating image paths", async () => {
    const input = await createSirArchive({
      manifest: {
        sir: 1,
        title: "Too Large",
        language: "en",
        slide_count: 2_001,
      },
    });

    const result = await validateSirFile(input);

    expectErrorCode(result, "manifest_slide_count_too_large");
  });

  it("rejects a missing slide image", async () => {
    const input = await createSirArchive({ slideImages: ["slides/0001.webp"] });

    const result = await validateSirFile(input);

    expectErrorCode(result, "missing_slide_image");
  });

  it("rejects a wrong image filename", async () => {
    const input = await createSirArchive({
      slideImages: ["slides/0001.webp", "slides/2.webp"],
    });

    const result = await validateSirFile(input);

    expectErrorCode(result, "unexpected_slide_image");
  });

  it("rejects a file with a WebP extension but invalid contents", async () => {
    const input = await createSirArchive({ useInvalidImageBytes: true });

    const result = await validateSirFile(input);

    expectErrorCode(result, "invalid_slide_image_format");
  });
});

describe("SIR v1 parsing", () => {
  it("parseSirMarkdown extracts titles", () => {
    const slides = parseSirMarkdown(`
Deck preface.

<!-- slide: 1 -->
# Slide 1 - Intro

Body one.

<!-- slide: 2 -->
Plain body.

# Slide 2 - Details
`);

    expect(slides).toEqual([
      {
        slideNumber: 1,
        sourceNumber: 1,
        sourceSlideNumber: 1,
        title: "Slide 1 - Intro",
        markdown: "\n# Slide 1 - Intro\n\nBody one.\n\n",
      },
      {
        slideNumber: 2,
        sourceNumber: 1,
        sourceSlideNumber: 2,
        title: "Slide 2 - Details",
        markdown: "\nPlain body.\n\n# Slide 2 - Details\n",
      },
    ]);
  });

  it("removes compiler separators at the end of slide Markdown", () => {
    const slides = parseSirMarkdown(`
<!-- slide: 1 -->
# One

Body.

---
<!-- slide: 2 -->
# Two

***
`);

    expect(slides[0]?.markdown).toBe("\n# One\n\nBody.\n");
    expect(slides[1]?.markdown).toBe("\n# Two\n");
  });

  it("parseSirFile validates and returns manifest, slides, and image paths", async () => {
    const input = await createSirArchive();

    const parsed = await parseSirFile(input);

    expect(parsed.manifest.title).toBe("Example Deck");
    expect(parsed.slides).toHaveLength(2);
    expect(parsed.imagePaths).toEqual(["slides/0001.webp", "slides/0002.webp"]);
  });
});

describe("SIR v2 mixed-corpus validation and parsing", () => {
  it("accepts PDF, image, and Markdown sources with consecutive ranges", async () => {
    const input = await createMixedCorpusArchive();
    const validation = await validateSirFile(input);

    expect(validation.valid).toBe(true);
    if (!validation.valid) {
      throw new Error("Expected valid result");
    }

    expect(validation.manifest).toEqual({
      sir: 2,
      title: "Database Exam Corpus",
      language: "it",
      source_count: 3,
      slide_count: 4,
    });
    expect(validation.sources.map((source) => source.mediaType)).toEqual([
      "pdf",
      "image",
      "markdown",
    ]);

    const parsed = await parseSirFile(input);
    expect(parsed.slides.map((slide) => [
      slide.slideNumber,
      slide.sourceNumber,
      slide.sourceSlideNumber,
    ])).toEqual([
      [1, 1, 1],
      [2, 1, 2],
      [3, 2, 1],
      [4, 3, 1],
    ]);

    const chunks = chunkSlides(parsed, {
      deckId: "database-corpus",
      sourceLabel: "Source 4",
    });
    expect(
      chunks.map((chunk) => [
        chunk.sourceLabel,
        chunk.sourceTitle,
        chunk.slideNumber,
        chunk.sourceSlideNumber,
      ]),
    ).toEqual([
      ["Source 4", "slides", 1, 1],
      ["Source 4", "slides", 2, 2],
      ["Source 5", "exam", 3, 1],
      ["Source 6", "organizzazione", 4, 1],
    ]);
  });

  it("requires sources.json for SIR v2", async () => {
    const input = await createMixedCorpusArchive({ includeSources: false });
    expectErrorCode(await validateSirFile(input), "missing_sources");
  });

  it("rejects source ranges that overlap or leave gaps", async () => {
    const input = await createMixedCorpusArchive({
      sources: [
        createSource(1, "slides.pdf", "pdf", 1, 2),
        createSource(2, "exam.jpeg", "image", 2, 1),
        createSource(3, "outline.md", "markdown", 4, 1),
      ],
    });
    expectErrorCode(
      await validateSirFile(input),
      "non_consecutive_source_ranges",
    );
  });

  it("rejects extra source metadata fields", async () => {
    const sources = defaultMixedSources();
    const input = await createMixedCorpusArchive({
      sources: [{ ...sources[0], checksum: "nope" }, ...sources.slice(1)],
    });
    expectErrorCode(await validateSirFile(input), "unexpected_source_field");
  });

  it("rejects generic visual placeholders instead of semantic transcription", async () => {
    const input = await createMixedCorpusArchive({
      markdown: [
        "<!-- slide: 1 -->\n# Introduzione\nContenuto didattico completo della prima pagina.",
        "<!-- slide: 2 -->\n# Diagramma ER\n_Struttura visiva rilevata: 12 gruppi di elementi vettoriali; la disposizione completa è conservata nell’immagine della slide._",
        "<!-- slide: 3 -->\n# Foto esame\nTrascrizione completa della domanda SQL fotografata.",
        "<!-- slide: 4 -->\n# Organizzazione\nProgramma completo e bibliografia consigliata del corso.",
      ].join("\n\n"),
    });

    expectErrorCode(await validateSirFile(input), "generic_visual_placeholder");
  });

  it("rejects visual-review completion claims used instead of transcription", async () => {
    const input = await createMixedCorpusArchive({
      markdown: [
        "<!-- slide: 1 -->\n# Introduzione\nContenuto didattico completo della prima pagina.",
        "<!-- slide: 2 -->\n# Esercizio E-R\nContenuto non testuale trascritto e descritto dopo revisione visiva.",
        "<!-- slide: 3 -->\n# Foto esame\nTrascrizione completa della domanda SQL fotografata.",
        "<!-- slide: 4 -->\n# Organizzazione\nProgramma completo e bibliografia consigliata del corso.",
      ].join("\n\n"),
    });

    expectErrorCode(await validateSirFile(input), "generic_visual_placeholder");
  });
});

interface CreateSirArchiveOptions {
  includeManifest?: boolean;
  includeMarkdown?: boolean;
  manifest?: Record<string, unknown>;
  markdown?: string;
  slideImages?: string[];
  extraRootFiles?: string[];
  useInvalidImageBytes?: boolean;
}

async function createSirArchive({
  includeManifest = true,
  includeMarkdown = true,
  manifest = {
    sir: 1,
    title: "Example Deck",
    language: "en",
    slide_count: 2,
  },
  markdown = `
<!-- slide: 1 -->
# Slide 1

<!-- slide: 2 -->
# Slide 2
`,
  slideImages = ["slides/0001.webp", "slides/0002.webp"],
  extraRootFiles = [],
  useInvalidImageBytes = false,
}: CreateSirArchiveOptions = {}): Promise<Uint8Array> {
  const zip = new JSZip();

  if (includeManifest) {
    zip.file("manifest.json", JSON.stringify(manifest));
  }

  if (includeMarkdown) {
    zip.file("sir.md", markdown);
  }

  zip.folder("slides");
  for (const imagePath of slideImages) {
    zip.file(
      imagePath,
      useInvalidImageBytes
        ? new Uint8Array([1, 2, 3])
        : new Uint8Array([
            0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45,
            0x42, 0x50,
          ]),
    );
  }

  for (const extraRootFile of extraRootFiles) {
    zip.file(extraRootFile, "extra");
  }

  return zip.generateAsync({ type: "uint8array" });
}

async function createMixedCorpusArchive({
  includeSources = true,
  sources = defaultMixedSources(),
  markdown = [
    "<!-- slide: 1 -->\n# Introduzione\nContenuto didattico completo della prima pagina.",
    "<!-- slide: 2 -->\n# Diagramma ER\nDescrizione completa di entità, relazioni e cardinalità.",
    "<!-- slide: 3 -->\n# Foto esame\nTrascrizione completa della domanda SQL fotografata.",
    "<!-- slide: 4 -->\n# Organizzazione\nProgramma completo e bibliografia consigliata del corso.",
  ].join("\n\n"),
}: {
  includeSources?: boolean;
  sources?: Record<string, unknown>[];
  markdown?: string;
} = {}): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "manifest.json",
    JSON.stringify({
      sir: 2,
      title: "Database Exam Corpus",
      language: "it",
      source_count: 3,
      slide_count: 4,
    }),
  );
  if (includeSources) {
    zip.file("sources.json", JSON.stringify(sources));
  }
  zip.file("sir.md", markdown);
  zip.folder("slides");
  for (let slideNumber = 1; slideNumber <= 4; slideNumber += 1) {
    zip.file(
      `slides/${String(slideNumber).padStart(4, "0")}.webp`,
      validWebPBytes(),
    );
  }
  return zip.generateAsync({ type: "uint8array" });
}

function defaultMixedSources(): Record<string, unknown>[] {
  return [
    createSource(1, "lectures/slides.pdf", "pdf", 1, 2),
    createSource(2, "exams/exam.jpeg", "image", 3, 1),
    createSource(3, "organizzazione.md", "markdown", 4, 1),
  ];
}

function createSource(
  source: number,
  path: string,
  type: "pdf" | "image" | "markdown",
  slideStart: number,
  slideCount: number,
): Record<string, unknown> {
  return {
    source,
    title: path.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? path,
    path,
    type,
    language: "it",
    slide_start: slideStart,
    slide_count: slideCount,
  };
}

function validWebPBytes(): Uint8Array {
  return new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45,
    0x42, 0x50,
  ]);
}

function expectErrorCode(
  result: Awaited<ReturnType<typeof validateSirFile>>,
  code: string,
) {
  expect(result.valid).toBe(false);
  if (result.valid) {
    throw new Error("Expected invalid result");
  }

  expect(result.errors.map((error) => error.code)).toContain(code);
}
