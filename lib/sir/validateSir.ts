import JSZip from "jszip";

import { extractSlideMarkers } from "./parseSirMarkdown";
import type {
  ParsedSirSource,
  SirManifest,
  SirSourceMediaType,
  SirValidationError,
  SirValidationResult,
  SirV2Source,
} from "./types";

const v1ManifestFields = ["sir", "title", "language", "slide_count"];
const v2ManifestFields = [
  "sir",
  "title",
  "language",
  "source_count",
  "slide_count",
];
const v2SourceFields = [
  "source",
  "title",
  "path",
  "type",
  "language",
  "slide_start",
  "slide_count",
];
const sourceMediaTypes = new Set<SirSourceMediaType>([
  "pdf",
  "image",
  "markdown",
]);
const allowedRootEntries = new Set([
  "manifest.json",
  "sources.json",
  "sir.md",
  "slides",
]);
const maxArchiveBytes = 256 * 1024 * 1024;
const maxSlideCount = 2_000;

export async function validateSirFile(
  input: ArrayBuffer | Uint8Array,
): Promise<SirValidationResult> {
  if (input.byteLength > maxArchiveBytes) {
    return {
      valid: false,
      errors: [
        {
          code: "sir_archive_too_large",
          message: "SIR archives must be 256 MB or smaller.",
        },
      ],
    };
  }

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
  const sourcesFile = zip.file("sources.json");
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
  let sources: ParsedSirSource[] | undefined;

  if (manifest?.sir === 2) {
    if (!sourcesFile) {
      errors.push({
        code: "missing_sources",
        message: "sources.json must exist at the archive root for SIR v2.",
        path: "sources.json",
      });
    } else {
      sources = await readAndValidateSources(sourcesFile, manifest, errors);
    }
  } else if (manifest?.sir === 1) {
    if (sourcesFile) {
      errors.push({
        code: "unexpected_root_entry",
        message: 'Unexpected root entry "sources.json" for SIR v1.',
        path: "sources.json",
      });
    }
    sources = [createV1Source(manifest)];
  }

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
    sources: sources as ParsedSirSource[],
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

  const manifest = parsed as Record<string, unknown>;
  const expectedFields =
    manifest.sir === 1
      ? v1ManifestFields
      : manifest.sir === 2
        ? v2ManifestFields
        : v1ManifestFields;
  const keys = Object.keys(parsed);
  const keySet = new Set(keys);

  for (const field of expectedFields) {
    if (!keySet.has(field)) {
      errors.push({
        code: "missing_manifest_field",
        message: `manifest.json is missing required field "${field}".`,
        path: "manifest.json",
      });
    }
  }

  for (const field of keys) {
    if (!expectedFields.includes(field)) {
      errors.push({
        code: "unexpected_manifest_field",
        message: `manifest.json contains unexpected field "${field}".`,
        path: "manifest.json",
      });
    }
  }

  if (manifest.sir !== 1 && manifest.sir !== 2) {
    errors.push({
      code: "invalid_manifest_sir",
      message: "manifest.sir must equal 1 or 2.",
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
  } else if (manifest.slide_count > maxSlideCount) {
    errors.push({
      code: "manifest_slide_count_too_large",
      message: `manifest.slide_count must not exceed ${maxSlideCount}.`,
      path: "manifest.json",
    });
  }

  if (
    manifest.sir === 2 &&
    (typeof manifest.source_count !== "number" ||
      !Number.isInteger(manifest.source_count) ||
      manifest.source_count <= 0)
  ) {
    errors.push({
      code: "invalid_manifest_source_count",
      message: "manifest.source_count must be a positive integer for SIR v2.",
      path: "manifest.json",
    });
  }

  if (errors.length > initialErrorCount) {
    return undefined;
  }

  return {
    sir: manifest.sir as 1 | 2,
    title: manifest.title as string,
    language: manifest.language as string,
    slide_count: manifest.slide_count as number,
    ...(manifest.sir === 2
      ? { source_count: manifest.source_count as number }
      : {}),
  } as SirManifest;
}

async function readAndValidateSources(
  file: JSZip.JSZipObject,
  manifest: Extract<SirManifest, { sir: 2 }>,
  errors: SirValidationError[],
): Promise<ParsedSirSource[] | undefined> {
  const initialErrorCount = errors.length;
  let parsed: unknown;

  try {
    parsed = JSON.parse(await file.async("string"));
  } catch {
    errors.push({
      code: "invalid_sources_json",
      message: "sources.json must contain valid JSON.",
      path: "sources.json",
    });
    return undefined;
  }

  if (!Array.isArray(parsed)) {
    errors.push({
      code: "invalid_sources_shape",
      message: "sources.json must contain a JSON array.",
      path: "sources.json",
    });
    return undefined;
  }

  if (parsed.length !== manifest.source_count) {
    errors.push({
      code: "source_count_mismatch",
      message: `sources.json must contain exactly ${manifest.source_count} source record(s); found ${parsed.length}.`,
      path: "sources.json",
    });
  }

  const sources: SirV2Source[] = [];
  const seenPaths = new Set<string>();

  for (const [index, value] of parsed.entries()) {
    const path = `sources.json[${index}]`;

    if (!isPlainObject(value)) {
      errors.push({
        code: "invalid_source_shape",
        message: `Source record ${index + 1} must be a JSON object.`,
        path,
      });
      continue;
    }

    const keys = Object.keys(value);
    for (const field of v2SourceFields) {
      if (!(field in value)) {
        errors.push({
          code: "missing_source_field",
          message: `Source record ${index + 1} is missing required field "${field}".`,
          path,
        });
      }
    }
    for (const field of keys) {
      if (!v2SourceFields.includes(field)) {
        errors.push({
          code: "unexpected_source_field",
          message: `Source record ${index + 1} contains unexpected field "${field}".`,
          path,
        });
      }
    }

    const expectedSourceNumber = index + 1;
    if (value.source !== expectedSourceNumber) {
      errors.push({
        code: "non_consecutive_sources",
        message: `Source numbers must be consecutive from 1 to ${manifest.source_count}.`,
        path,
      });
    }
    validateNonEmptyString(value.title, "title", index, errors);
    validateNonEmptyString(value.path, "path", index, errors);
    validateNonEmptyString(value.language, "language", index, errors);

    if (
      typeof value.type !== "string" ||
      !sourceMediaTypes.has(value.type as SirSourceMediaType)
    ) {
      errors.push({
        code: "invalid_source_type",
        message: `Source record ${index + 1} type must be pdf, image, or markdown.`,
        path,
      });
    }

    for (const field of ["slide_start", "slide_count"] as const) {
      if (
        typeof value[field] !== "number" ||
        !Number.isInteger(value[field]) ||
        value[field] <= 0
      ) {
        errors.push({
          code: "invalid_source_slide_range",
          message: `Source record ${index + 1} ${field} must be a positive integer.`,
          path,
        });
      }
    }

    if (typeof value.path === "string") {
      const normalizedPath = value.path.trim();
      const pathSegments = normalizedPath.split("/");

      if (
        normalizedPath !== value.path ||
        normalizedPath.startsWith("/") ||
        /^[A-Za-z]:/.test(normalizedPath) ||
        normalizedPath.includes("\\") ||
        pathSegments.some(
          (segment) => segment === "" || segment === "." || segment === "..",
        )
      ) {
        errors.push({
          code: "invalid_source_path",
          message: `Source path "${value.path}" must be a normalized relative path using forward slashes.`,
          path,
        });
      }

      if (seenPaths.has(normalizedPath)) {
        errors.push({
          code: "duplicate_source_path",
          message: `Source path "${normalizedPath}" is duplicated.`,
          path,
        });
      }
      seenPaths.add(normalizedPath);
    }

    sources.push(value as unknown as SirV2Source);
  }

  validateSourceRanges(sources, manifest.slide_count, errors);

  if (errors.length > initialErrorCount) {
    return undefined;
  }

  return sources.map((source) => ({
    sourceNumber: source.source,
    title: source.title.trim(),
    originalPath: source.path.trim(),
    mediaType: source.type,
    language: source.language.trim(),
    slideStart: source.slide_start,
    slideCount: source.slide_count,
  }));
}

function validateNonEmptyString(
  value: unknown,
  field: string,
  sourceIndex: number,
  errors: SirValidationError[],
) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({
      code: "invalid_source_field",
      message: `Source record ${sourceIndex + 1} ${field} must be a non-empty string.`,
      path: `sources.json[${sourceIndex}]`,
    });
  }
}

function validateSourceRanges(
  sources: SirV2Source[],
  slideCount: number,
  errors: SirValidationError[],
) {
  let expectedStart = 1;

  for (const [index, source] of sources.entries()) {
    if (source.slide_start !== expectedStart) {
      errors.push({
        code: "non_consecutive_source_ranges",
        message: "Source slide ranges must be consecutive, non-overlapping, and start at slide 1.",
        path: `sources.json[${index}]`,
      });
      return;
    }

    expectedStart += source.slide_count;
  }

  if (expectedStart - 1 !== slideCount) {
    errors.push({
      code: "source_slide_count_mismatch",
      message: `Source slide ranges must cover exactly ${slideCount} slide(s).`,
      path: "sources.json",
    });
  }
}

function createV1Source(
  manifest: Extract<SirManifest, { sir: 1 }>,
): ParsedSirSource {
  return {
    sourceNumber: 1,
    title: manifest.title,
    originalPath: "",
    mediaType: "sir-v1",
    language: manifest.language,
    slideStart: 1,
    slideCount: manifest.slide_count,
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
