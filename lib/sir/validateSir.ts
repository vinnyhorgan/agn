import JSZip from "jszip";

import { extractSlideMarkers } from "./parseSirMarkdown";
import type {
  SirManifest,
  SirValidationError,
  SirValidationResult,
} from "./types";

const requiredManifestFields = ["sir", "title", "language", "slide_count"];
const allowedRootEntries = new Set(["manifest.json", "sir.md", "slides"]);

export async function validateSirFile(
  input: ArrayBuffer | Uint8Array,
): Promise<SirValidationResult> {
  let zip: JSZip;

  try {
    zip = await JSZip.loadAsync(input);
  } catch {
    return {
      valid: false,
      errors: [
        {
          code: "invalid_zip",
          message: "Input is not a valid ZIP archive.",
        },
      ],
    };
  }

  const errors: SirValidationError[] = [];
  const entries = Object.values(zip.files);
  const entryNames = entries.map((entry) => entry.name);
  const rootEntries = new Set(
    entryNames
      .map((name) => name.replace(/\/$/, "").split("/")[0])
      .filter(Boolean),
  );

  for (const rootEntry of rootEntries) {
    if (!allowedRootEntries.has(rootEntry)) {
      errors.push({
        code: "unexpected_root_entry",
        message: `Unexpected root entry "${rootEntry}".`,
        path: rootEntry,
      });
    }
  }

  const manifestFile = zip.file("manifest.json");
  const markdownFile = zip.file("sir.md");
  const hasSlidesDirectory =
    Boolean(zip.files["slides/"]?.dir) ||
    entries.some((entry) => entry.name.startsWith("slides/"));

  if (!manifestFile) {
    errors.push({
      code: "missing_manifest",
      message: "manifest.json must exist at the archive root.",
      path: "manifest.json",
    });
  }

  if (!markdownFile) {
    errors.push({
      code: "missing_sir_markdown",
      message: "sir.md must exist at the archive root.",
      path: "sir.md",
    });
  }

  if (!hasSlidesDirectory) {
    errors.push({
      code: "missing_slides_directory",
      message: "slides/ must exist at the archive root.",
      path: "slides/",
    });
  }

  const manifest = manifestFile
    ? await readAndValidateManifest(manifestFile, errors)
    : undefined;

  const markdown = markdownFile ? await markdownFile.async("string") : undefined;
  const slideMarkers = markdown ? extractSlideMarkers(markdown) : [];

  if (manifest) {
    validateSlideMarkers(slideMarkers, manifest.slide_count, errors);
    await validateSlideImages(entries, manifest.slide_count, errors);
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
    };
  }

  return {
    valid: true,
    errors: [],
    manifest: manifest as SirManifest,
    slideMarkers,
    imagePaths: expectedSlideImagePaths((manifest as SirManifest).slide_count),
  };
}

async function readAndValidateManifest(
  file: JSZip.JSZipObject,
  errors: SirValidationError[],
): Promise<SirManifest | undefined> {
  const initialErrorCount = errors.length;
  let parsed: unknown;

  try {
    parsed = JSON.parse(await file.async("string"));
  } catch {
    errors.push({
      code: "invalid_manifest_json",
      message: "manifest.json must contain valid JSON.",
      path: "manifest.json",
    });
    return undefined;
  }

  if (!isPlainObject(parsed)) {
    errors.push({
      code: "invalid_manifest_shape",
      message: "manifest.json must contain a JSON object.",
      path: "manifest.json",
    });
    return undefined;
  }

  const keys = Object.keys(parsed);
  const keySet = new Set(keys);

  for (const field of requiredManifestFields) {
    if (!keySet.has(field)) {
      errors.push({
        code: "missing_manifest_field",
        message: `manifest.json is missing required field "${field}".`,
        path: "manifest.json",
      });
    }
  }

  for (const field of keys) {
    if (!requiredManifestFields.includes(field)) {
      errors.push({
        code: "unexpected_manifest_field",
        message: `manifest.json contains unexpected field "${field}".`,
        path: "manifest.json",
      });
    }
  }

  const manifest = parsed as Record<string, unknown>;

  if (manifest.sir !== 1) {
    errors.push({
      code: "invalid_manifest_sir",
      message: "manifest.sir must equal 1.",
      path: "manifest.json",
    });
  }

  if (typeof manifest.title !== "string" || manifest.title.trim() === "") {
    errors.push({
      code: "invalid_manifest_title",
      message: "manifest.title must be a non-empty string.",
      path: "manifest.json",
    });
  }

  if (
    typeof manifest.language !== "string" ||
    manifest.language.trim() === ""
  ) {
    errors.push({
      code: "invalid_manifest_language",
      message: "manifest.language must be a non-empty string.",
      path: "manifest.json",
    });
  }

  if (
    typeof manifest.slide_count !== "number" ||
    !Number.isInteger(manifest.slide_count) ||
    manifest.slide_count <= 0
  ) {
    errors.push({
      code: "invalid_manifest_slide_count",
      message: "manifest.slide_count must be a positive integer.",
      path: "manifest.json",
    });
  }

  if (errors.length > initialErrorCount) {
    return undefined;
  }

  return {
    sir: 1,
    title: manifest.title as string,
    language: manifest.language as string,
    slide_count: manifest.slide_count as number,
  };
}

function validateSlideMarkers(
  slideMarkers: number[],
  slideCount: number,
  errors: SirValidationError[],
) {
  if (slideMarkers.length !== slideCount) {
    errors.push({
      code: "slide_marker_count_mismatch",
      message: `sir.md must contain exactly ${slideCount} slide marker(s); found ${slideMarkers.length}.`,
      path: "sir.md",
    });
  }

  for (let index = 0; index < slideCount; index += 1) {
    const expectedSlideNumber = index + 1;
    if (slideMarkers[index] !== expectedSlideNumber) {
      errors.push({
        code: "non_consecutive_slide_markers",
        message: `Slide markers must be consecutive from 1 to ${slideCount}.`,
        path: "sir.md",
      });
      return;
    }
  }
}

async function validateSlideImages(
  entries: JSZip.JSZipObject[],
  slideCount: number,
  errors: SirValidationError[],
) {
  const unexpectedDirectories = entries.filter(
    (entry) => entry.dir && entry.name.startsWith("slides/") && entry.name !== "slides/",
  );

  for (const directory of unexpectedDirectories) {
    errors.push({
      code: "unexpected_slides_entry",
      message: `Unexpected directory "${directory.name}" inside slides/.`,
      path: directory.name,
    });
  }

  const slideFiles = entries
    .filter((entry) => !entry.dir && entry.name.startsWith("slides/"))
    .map((entry) => entry.name);
  const slideFileSet = new Set(slideFiles);
  const expectedPaths = expectedSlideImagePaths(slideCount);

  if (slideFiles.length !== slideCount) {
    errors.push({
      code: "slide_image_count_mismatch",
      message: `slides/ must contain exactly ${slideCount} WebP image file(s); found ${slideFiles.length}.`,
      path: "slides/",
    });
  }

  for (const path of slideFiles) {
    if (!expectedPaths.includes(path)) {
      errors.push({
        code: "unexpected_slide_image",
        message: `Unexpected slide image path "${path}".`,
        path,
      });
    }
  }

  for (const path of expectedPaths) {
    if (!slideFileSet.has(path)) {
      errors.push({
        code: "missing_slide_image",
        message: `Missing slide image "${path}".`,
        path,
      });
    }
  }

  for (const path of slideFiles.filter((candidate) => expectedPaths.includes(candidate))) {
    const file = entries.find((entry) => entry.name === path);

    if (file && !(await hasWebPHeader(file))) {
      errors.push({
        code: "invalid_slide_image_format",
        message: `Slide image "${path}" is not a valid WebP file.`,
        path,
      });
    }
  }
}

async function hasWebPHeader(file: JSZip.JSZipObject): Promise<boolean> {
  const bytes = await file.async("uint8array");

  return (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function expectedSlideImagePaths(slideCount: number): string[] {
  return Array.from(
    { length: slideCount },
    (_, index) => `slides/${String(index + 1).padStart(4, "0")}.webp`,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
