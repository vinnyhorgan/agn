import { describe, expect, it } from "vitest";

import { repairWebCitations } from "../../lib/web/citations";
import { isExplicitWebSearch, shouldSearchWeb } from "../../lib/web/tavily";

const results = [
  {
    title: "Official release notes",
    url: "https://example.com/releases",
    content: "Version 2 was released today.",
    score: 0.91,
  },
];

describe("web-search harness", () => {
  it("routes explicit and time-sensitive questions to web search", () => {
    expect(shouldSearchWeb("Search the web for the latest release")).toBe(true);
    expect(shouldSearchWeb("What is the current stable version?")).toBe(true);
    expect(shouldSearchWeb("Explain candidate keys")).toBe(false);
    expect(isExplicitWebSearch("Look this up on the internet")).toBe(true);
  });

  it("turns valid web markers into exact links and removes invented markers", () => {
    expect(
      repairWebCitations("Released today [Web 1]. Invented [Web 4].", results),
    ).toBe(
      "Released today [Web 1 — Official release notes](<https://example.com/releases>). Invented.",
    );
  });
});
