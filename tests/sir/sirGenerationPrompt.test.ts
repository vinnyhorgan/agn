import { describe, expect, it } from "vitest";

import {
  sirGenerationPrompt,
  sirGenerationWorkflowSteps,
} from "../../lib/sir/sirGenerationPrompt";

describe("SIR generation prompt", () => {
  it("exists and includes the Generate SIR workflow steps", () => {
    expect(sirGenerationPrompt).toContain("AGN SIR v2 corpus compiler");

    for (const step of sirGenerationWorkflowSteps) {
      expect(sirGenerationPrompt).toContain(step);
    }
  });

  it("includes the required SIR v2 corpus structure and visual extraction rules", () => {
    expect(sirGenerationPrompt).toContain("manifest.json");
    expect(sirGenerationPrompt).toContain("sources.json");
    expect(sirGenerationPrompt).toContain("sir.md");
    expect(sirGenerationPrompt).toContain("slides/0001.webp");
    expect(sirGenerationPrompt).toContain("<!-- slide: N -->");
    expect(sirGenerationPrompt).toContain("ordinary PDFs, slide PDFs, scanned PDFs");
    expect(sirGenerationPrompt).toContain("ER diagrams");
    expect(sirGenerationPrompt).toContain("Markdown files");
    expect(sirGenerationPrompt).toContain("Never silently omit a supported source");
    expect(sirGenerationPrompt).toContain("content transcribed after visual review");
    expect(sirGenerationPrompt).toContain("exact relative path");
    expect(sirGenerationPrompt).toContain("internal ledger");
    expect(sirGenerationPrompt).toContain("actually inspect every rendered page visually");
  });

  it("is generic and contains no reference-corpus acceptance anchors", () => {
    expect(sirGenerationPrompt).not.toContain("OLANDA");
    expect(sirGenerationPrompt).not.toContain("Panchina");
    expect(sirGenerationPrompt).not.toContain("1158");
    expect(sirGenerationPrompt).not.toContain("reference database corpus");
  });
});
