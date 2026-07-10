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
  });
});
