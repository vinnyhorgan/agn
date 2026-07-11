// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatMessage } from "../../components/chat/ChatMessage";
import { ChatPanel } from "../../components/chat/ChatPanel";
import type { SourceChunk } from "../../lib/search/types";

describe("chat interactions", () => {
  beforeEach(() => {
    window.localStorage.clear();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("renders Markdown and opens a valid source citation", async () => {
    const user = userEvent.setup();
    const onCitationClick = vi.fn();

    render(
      <ChatMessage
        role="assistant"
        content="**Supported claim.** [Source 1, Slide 3]"
        validCitations={new Set(["1:3"])}
        onCitationClick={onCitationClick}
      />,
    );

    expect(screen.getByText("Supported claim.").tagName).toBe("STRONG");
    await user.click(
      screen.getByRole("button", { name: "[Source 1, Slide 3]" }),
    );
    expect(onCitationClick).toHaveBeenCalledWith(1, 3);
  });

  it("loads and persists the DeepInfra key in localStorage", async () => {
    window.localStorage.setItem("agn.deepInfra.apiKey", "saved-key");
    const user = userEvent.setup();

    render(<ChatPanel sourceChunks={[]} />);
    await user.click(screen.getByText("Providers"));

    const input = screen.getByLabelText("DeepInfra API key") as HTMLInputElement;
    expect(input.value).toBe("saved-key");

    await user.clear(input);
    await user.type(input, "replacement-key");

    await waitFor(() => {
      expect(window.localStorage.getItem("agn.deepInfra.apiKey")).toBe(
        "replacement-key",
      );
    });
  });

  it("stores the optional Tavily key only in browser localStorage", async () => {
    const user = userEvent.setup();
    render(<ChatPanel sourceChunks={[]} />);
    await user.click(screen.getByText("Providers"));

    const input = screen.getByLabelText("Tavily API key");
    await user.type(input, "tvly-test-key");

    await waitFor(() => {
      expect(window.localStorage.getItem("agn.tavily.apiKey")).toBe(
        "tvly-test-key",
      );
    });
  });

  it("copies a diagnostic export with the full chat and retrieved context", async () => {
    const source: SourceChunk = {
      id: "deck-1:slide-3-chunk-1",
      deckId: "deck-1",
      deckTitle: "Database Foundations",
      sourceLabel: "Source 2",
      sourceTitle: "Relational model",
      sourcePath: "lectures/relational.pdf",
      sourceMediaType: "pdf",
      slideNumber: 8,
      sourceSlideNumber: 3,
      slideTitle: "Candidate keys",
      headingPath: ["Keys", "Candidate keys"],
      text: "A candidate key is a minimal superkey.",
      slideImagePath: "slides/0008.webp",
    };
    window.localStorage.setItem(
      "agn.chat.history",
      JSON.stringify([
        {
          id: "turn-1",
          question: "What is a candidate key?",
          answer: "It is a minimal superkey. [Source 2, Slide 3]",
          sourceIds: [source.id],
          status: "complete",
        },
      ]),
    );
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<ChatPanel sourceChunks={[source]} sourceCount={1} />);
    await user.click(
      screen.getByRole("button", { name: "Copy chat for diagnosis" }),
    );

    expect(writeText).toHaveBeenCalledOnce();
    const exportText = String(writeText.mock.calls[0]?.[0]);
    expect(exportText).toContain("# AGN chat diagnostic export");
    expect(exportText).toContain("What is a candidate key?");
    expect(exportText).toContain("It is a minimal superkey.");
    expect(exportText).toContain("lectures/relational.pdf");
    expect(exportText).toContain("A candidate key is a minimal superkey.");
  });

  it("restores the actionable failure cause instead of presenting evidence as completed", () => {
    window.localStorage.setItem(
      "agn.chat.history",
      JSON.stringify([
        {
          id: "failed-turn",
          question: "Search the web, then explain it",
          answer: "",
          sourceIds: [],
          webResults: [
            {
              title: "A result",
              url: "https://example.com/result",
              content: "Evidence",
              score: 0.9,
            },
          ],
          status: "error",
          error: "DeepInfra rejected this API key. Check that it is valid and has access.",
        },
      ]),
    );

    render(<ChatPanel sourceChunks={[]} />);

    expect(screen.getByText(/DeepInfra rejected this API key/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /A result/ })).toBeNull();
  });
});
