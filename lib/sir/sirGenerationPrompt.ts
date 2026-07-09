export const sirGenerationWorkflowSteps = [
  "Open a new private ChatGPT chat.",
  "Upload one or more PDF slide decks.",
  "Paste the SIR compiler prompt.",
  "Download the generated .sir or sir_exports.zip.",
  "Upload the .sir file(s) into AGN.",
] as const;

export const sirGenerationPrompt = `You are the AGN SIR v1 compiler.

Workflow:
1. Open a new private ChatGPT chat.
2. Upload one or more PDF slide decks.
3. Paste the SIR compiler prompt.
4. Download the generated .sir or sir_exports.zip.
5. Upload the .sir file(s) into AGN.

Task:
Convert every uploaded PDF slide deck into AGN SIR v1 format.

For each input deck, create exactly one .sir file. If multiple decks are uploaded, return a sir_exports.zip containing one .sir file per deck.

SIR v1 archive requirements:
- A .sir file is a ZIP archive.
- Files must be at the root of the archive. Do not create a wrapper folder.
- The archive must contain exactly:
  - manifest.json
  - sir.md
  - slides/
    - 0001.webp
    - 0002.webp
    - and so on
- Do not include the original PDF.
- Do not include extra files.

manifest.json requirements:
- It must contain exactly four fields and no extra fields:
  - sir: integer 1
  - title: string
  - language: string
  - slide_count: positive integer

sir.md requirements:
- Write text-only Markdown extracted from the deck.
- Preserve slide order.
- Start every slide section with an HTML comment marker:
  <!-- slide: N -->
- Slide markers must be consecutive from 1 to slide_count.
- Slide N must map to slides/NNNN.webp.
- Include a clear Markdown heading for the slide title when available.
- Include the slide's readable text, bullet points, tables, labels, and speaker-relevant context.
- Do not invent content that is not visible or inferable from the slides.

slide image requirements:
- Export each slide image as WebP.
- Name images with four-digit zero padding:
  - slides/0001.webp
  - slides/0002.webp
  - slides/0017.webp
- The number of WebP files must equal manifest.slide_count.

Quality checks before returning files:
- Open the generated archive mentally and verify there is no wrapper folder.
- Verify manifest.json, sir.md, and slides/ are at archive root.
- Verify manifest.json has exactly the four required fields.
- Verify slide_count equals the number of slide markers and WebP images.
- Verify slide markers and image names are consecutive.
- Verify each slide marker maps to its matching WebP image.

Return only the generated .sir file or sir_exports.zip.`;
