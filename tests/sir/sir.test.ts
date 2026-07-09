import { describe, expect, it } from "vitest";
import JSZip from "jszip";

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
        title: "Slide 1 - Intro",
        markdown: "\n# Slide 1 - Intro\n\nBody one.\n\n",
      },
      {
        slideNumber: 2,
        title: "Slide 2 - Details",
        markdown: "\nPlain body.\n\n# Slide 2 - Details\n",
      },
    ]);
  });

  it("parseSirFile validates and returns manifest, slides, and image paths", async () => {
    const input = await createSirArchive();

    const parsed = await parseSirFile(input);

    expect(parsed.manifest.title).toBe("Example Deck");
    expect(parsed.slides).toHaveLength(2);
    expect(parsed.imagePaths).toEqual(["slides/0001.webp", "slides/0002.webp"]);
  });
});

interface CreateSirArchiveOptions {
  includeManifest?: boolean;
  includeMarkdown?: boolean;
  manifest?: Record<string, unknown>;
  markdown?: string;
  slideImages?: string[];
  extraRootFiles?: string[];
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
    zip.file(imagePath, new Uint8Array([1, 2, 3]));
  }

  for (const extraRootFile of extraRootFiles) {
    zip.file(extraRootFile, "extra");
  }

  return zip.generateAsync({ type: "uint8array" });
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
