export const sirGenerationWorkflowSteps = [
  "Open a new private ChatGPT chat.",
  "Upload one ZIP containing the complete study corpus.",
  "Paste the SIR v2 corpus compiler prompt.",
  "Wait for the complete validated .sir archive.",
  "Upload the .sir archive into AGN.",
] as const;

export const sirGenerationPrompt = `You are the AGN SIR v2 corpus compiler.

Workflow:
1. Open a new private ChatGPT chat.
2. Upload one ZIP containing the complete study corpus.
3. Paste the SIR v2 corpus compiler prompt.
4. Wait for the complete validated .sir archive.
5. Upload the .sir archive into AGN.

Task:
Convert the entire uploaded study corpus into one complete AGN SIR v2 archive. The input may mix ordinary PDFs, slide PDFs, scanned PDFs, photographs, standalone images, and Markdown files in nested folders.

Supported source files:
- PDF: .pdf
- Images: .jpg, .jpeg, .png, .webp
- Markdown: .md, .markdown

Ignore hidden files and directories, metadata such as .DS_Store, version-control directories such as .git, and unsupported files. Never silently omit a supported source. Preserve each supported file's relative path.

Non-negotiable execution method:
1. Inventory every supported source and page before writing sir.md.
2. Render every page to its final WebP first.
3. Process slides in small visual-review batches. For every slide, compare the rendered WebP with extracted text and add everything the text layer missed.
4. Maintain an internal ledger with one row per global slide and these completion flags: rendered, native_text_checked, visual_reviewed, code_checked, diagram_checked, markdown_written. Do not place this ledger in the final archive.
5. Do not mark a slide complete until every applicable flag is true.
6. Assemble sir.md only from completed ledger rows, then run semantic and structural audits.

This is not a PDF text-extraction task. You must actually inspect every rendered page visually. PDF object metadata such as image counts, drawing counts, vector-group counts, bounding boxes, or statements that content remains visible in the image are not semantic transcription. OCR is only a draft and must be corrected against the page. Do not use a generic template for visual content.

SIR v2 archive structure:
- A .sir file is a ZIP archive.
- Files must be at the root. Do not create a wrapper folder.
- The archive must contain exactly:
  - manifest.json
  - sources.json
  - sir.md
  - slides/
    - 0001.webp
    - 0002.webp
    - and so on
- Do not include original input files or any report, thumbnail, temporary, or metadata files.

manifest.json requirements:
- It must contain exactly five fields and no extra fields:
  - sir: integer 2
  - title: non-empty string describing the corpus
  - language: predominant language, or "mul" for a multilingual corpus
  - source_count: positive integer
  - slide_count: positive integer, at most 2000

sources.json requirements:
- It must be a JSON array with exactly manifest.source_count records.
- Order supported files by normalized relative path using a case-insensitive natural sort.
- Every record must contain exactly these seven fields:
  - source: consecutive integer starting at 1
  - title: useful human-readable source title
  - path: original relative path using forward slashes
  - type: exactly "pdf", "image", or "markdown"
  - language: source language, or "mul"
  - slide_start: first global slide number owned by this source
  - slide_count: positive number of slides owned by this source
- Source paths must be unique.
- Source slide ranges must start at global slide 1, be consecutive and non-overlapping, and cover every global slide exactly once.

Slide allocation:
- Each PDF page becomes exactly one slide, including cover, blank, scan, diagram-only, and appendix pages.
- Each standalone image becomes exactly one slide.
- Each Markdown file becomes one or more slides. Split at meaningful H1 or H2 boundaries when useful; keep a short file as one slide. Never drop text.
- Preserve source order and page order.
- A source's local slide number is global_slide - slide_start + 1. This is the page number AGN cites.

sir.md requirements:
- Start every slide section with exactly:
  <!-- slide: N -->
- Global markers must be consecutive from 1 through manifest.slide_count.
- Global slide N maps to slides/NNNN.webp.
- Begin each section with a useful Markdown H1 when a title is visible or can be conservatively derived.
- Transcribe all readable prose, labels, lists, tables, formulas, relational schemas, constraints, and annotations.
- Preserve SQL, relational algebra, and other code-like material in fenced code blocks without changing its meaning.
- Describe visual structure that plain text extraction loses. For ER diagrams, state entities, attributes, identifiers, relationships, cardinalities, participation constraints, and inheritance visible on the page. For tables and schemas, preserve rows, columns, keys, arrows, and connections. For handwritten solutions, transcribe readable writing and explain the visible structure conservatively.
- Use both the embedded text layer and visual inspection for every PDF page. A non-empty PDF text layer does not prove that code, diagrams, or annotations were extracted.
- For scans and photographs, correct orientation for reading and perform OCR plus visual inspection.
- Do not invent obscured content. Mark a genuinely unreadable fragment as [Illeggibile] in Italian material or [Unreadable] otherwise.
- Remove repetitive presentation chrome such as page numbers and course footers unless it carries source meaning.
- Do not write vague substitutes such as "diagram shown" or "image of SQL" when the content is readable.
- Forbidden output includes "Struttura visiva rilevata", "the layout is preserved in the slide image", image/vector object counts, or any equivalent placeholder. One occurrence makes the archive invalid.
- Do not merely repeat the slide title. Every non-blank slide must contain substantive searchable content beyond its H1.
- If a page mixes selectable text with raster or vector content, merge both into one faithful transcription. Never assume the selectable text is complete.
- When code is visible as an embedded image, manually transcribe the complete code and verify identifiers, operators, punctuation, accents, and line structure against the image.
- When a diagram is visible, name every readable node and edge and state the semantics of their connections. A list of disconnected labels is insufficient.

slide image requirements:
- Render every PDF page as a full-page WebP without cropping substantive content.
- Auto-orient standalone photographs and retain the complete page.
- Render Markdown slides to clean, readable WebP pages containing the corresponding text.
- Wrap or resize Markdown headings and code so that no text crosses or is clipped by an image boundary.
- Preserve portrait and landscape orientation.
- Use sufficient resolution for dense A4 text and diagrams, normally 1800 to 2200 pixels on the long edge, without upscaling a smaller source unnecessarily.
- Use four-digit global names such as slides/0001.webp and slides/0017.webp.
- The WebP count must equal manifest.slide_count.
- Keep the final archive at or below 256 MB.

Completeness and validation before returning:
1. Count all supported source files before conversion and reconcile that count with manifest.source_count and sources.json.
2. Reconcile every PDF's page count and every Markdown split with its source slide_count.
3. Verify source ranges are consecutive and cover 1 through manifest.slide_count.
4. Verify sir.md has exactly manifest.slide_count consecutive markers.
5. Verify slides/ has exactly manifest.slide_count valid WebP files with consecutive four-digit names.
6. Verify every page has meaningful Markdown unless it is truly blank; explicitly identify a truly blank page in its Markdown.
7. Search sir.md for every forbidden generic placeholder above. The required count is zero.
8. Detect slides whose body contains fewer than 24 substantive characters beyond the H1. Re-inspect and repair each one unless the page is explicitly and genuinely blank.
9. Review every occurrence of [Illeggibile] or [Unreadable] against the high-resolution WebP and keep it only when the exact fragment is genuinely impossible to read.
10. Verify Markdown-rendered WebPs have no clipped or overflowing text.
11. Verify the archive root contains only manifest.json, sources.json, sir.md, and slides/.
12. Reopen the finished ZIP and perform these checks again.

Acceptance anchors for the reference database corpus, when these exact paths are present:
- The corpus must contain 31 sources and 1158 slides after excluding .git.
- Esercizi di SQL.pdf, local slide 5 visibly contains a solution using CREATE VIEW OLANDA. Its Markdown must include the complete CREATE VIEW and SELECT statements and the identifiers OLANDA, PALAZZETTO, INCONTRO, and NAZIONALE.
- Esercizi_ER_esame_sol_rev2.pdf, local slide 3 is a handwritten ER solution. Its Markdown must transcribe and structurally describe the readable entities and relationships, including Panchina.
- BD-AC1-1718_1_B.jpeg must describe the visible A/B/C/D/E schema, relationship names including RCD, RDD, RDE, and RBE, identifiers, and cardinalities.
- organizzazione.md must be copied without text loss, and its rendered heading must fit inside the WebP.
- Search the finished sir.md for OLANDA and Panchina. Both must be present. If either is absent, visual review was not completed and the archive must not be returned.

Do not return a partial corpus, a draft, or a structurally correct archive with incomplete semantic text. Do not silently reduce image resolution until text becomes illegible. If you cannot visually review all 1158 reference-corpus slides within the available limits, explicitly say so instead of returning a .sir file. Otherwise return only the single generated .sir file.`;
