import { describe, expect, it } from "vitest";

import {
  sirGenerationPrompt,
  sirGenerationWorkflowSteps,
} from "../../lib/sir/sirGenerationPrompt";

describe("SIR generation prompt", () => {
  it("exists and includes the Generate SIR workflow steps", () => {
    expect(sirGenerationPrompt).toContain("AGN SIR v1 compiler");

    for (const step of sirGenerationWorkflowSteps) {
      expect(sirGenerationPrompt).toContain(step);
    }
  });

  it("includes the required SIR v1 archive structure", () => {
    expect(sirGenerationPrompt).toContain("manifest.json");
    expect(sirGenerationPrompt).toContain("sir.md");
    expect(sirGenerationPrompt).toContain("slides/0001.webp");
    expect(sirGenerationPrompt).toContain("<!-- slide: N -->");
  });
});
