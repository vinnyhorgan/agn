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
    vi.unstubAllGlobals();
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

  it("renders citations inside Markdown headings as source buttons", () => {
    render(
      <ChatMessage
        role="assistant"
        content="### Characteristics [Source 3, Slide 23]"
        validCitations={new Set(["3:23"])}
        onCitationClick={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "[Source 3, Slide 23]" })).toBeTruthy();
  });

  it("renders validated semantic study artifacts", () => {
    render(
      <ChatMessage
        role="assistant"
        content={'Process\n```agn-artifact\n{"artifact":"flowchart","version":1,"title":"Query pipeline","nodes":[{"id":"a","label":"Parse"},{"id":"b","label":"Execute"}],"edges":[{"from":"a","to":"b","label":"valid"}]}\n```'}
      />,
    );
    expect(screen.getByText("Query pipeline")).toBeTruthy();
    expect(screen.getByText("Parse")).toBeTruthy();
    expect(screen.getByText("Execute")).toBeTruthy();
  });

  it("offers and persists an explicit basic outline without an API request", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const source: SourceChunk = {
      id: "deck:slide-1-chunk-1", deckId: "deck", deckTitle: "Database course",
      sourceLabel: "Source 1", sourceTitle: "Relational model", sourcePath: "relational.pdf",
      sourceMediaType: "pdf", slideNumber: 1, sourceSlideNumber: 1,
      slideTitle: "Candidate keys", text: "A candidate key is a minimal superkey.",
      slideImagePath: "slides/0001.webp",
    };
    render(<ChatPanel sourceChunks={[source]} sourceCount={1} />);
    await user.click(screen.getByRole("button", { name: "Study chapters" }));
    await user.click(screen.getByRole("button", { name: "Use basic outline" }));
    expect(screen.getAllByText(/Relational model/).length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Object.keys(window.localStorage).some((key) => key.startsWith("agn.study."))).toBe(true);
  });

  it("keeps a usable local curriculum when AI organization fails", async () => {
    window.localStorage.setItem("agn.deepInfra.apiKey", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 504 })));
    const source: SourceChunk = {
      id: "deck:slide-1-chunk-1", deckId: "deck", deckTitle: "Database course",
      sourceLabel: "Source 1", sourceTitle: "Relational model", sourcePath: "relational.pdf",
      sourceMediaType: "pdf", sourceLanguage: "it", slideNumber: 1, sourceSlideNumber: 1,
      slideTitle: "Chiavi candidate", text: "Una chiave candidata è una superchiave minimale.",
      slideImagePath: "slides/0001.webp",
    };
    const user = userEvent.setup();
    render(<ChatPanel sourceChunks={[source]} sourceCount={1} />);
    await user.click(screen.getByRole("button", { name: "Study chapters" }));
    await user.click(screen.getByRole("button", { name: "Organize chapters with AI" }));
    await waitFor(() => expect(screen.getByText(/kept the complete local draft/)).toBeTruthy());
    expect(screen.getAllByText(/Relational model/).length).toBeGreaterThan(0);
    expect(Object.keys(window.localStorage).some((key) => key.startsWith("agn.study.v3."))).toBe(true);
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

  it("persists versioned routing, context, and timing diagnostics for a turn", async () => {
    window.localStorage.setItem("agn.deepInfra.apiKey", "test-key");
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode("A useful answer."));
            controller.close();
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ChatPanel sourceChunks={[]} />);
    await user.type(screen.getByLabelText("Ask a question"), "Explain gravity");
    await user.click(screen.getByRole("button", { name: "Send question" }));

    await waitFor(() => {
      expect(screen.getByText("A useful answer.")).toBeTruthy();
    });
    const stored = JSON.parse(
      window.localStorage.getItem("agn.chat.history") ?? "[]",
    ) as Array<{ diagnostics?: Record<string, unknown> }>;
    expect(stored[0]?.diagnostics).toMatchObject({
      version: 1,
      route: {
        kind: "deterministic",
        retrievalMode: "focused",
        webPolicy: "never",
      },
      web: { attempted: false, resultCount: 0 },
      context: { messageRoles: ["system", "user"] },
    });
    expect(
      (stored[0]?.diagnostics?.timingsMs as { total?: number }).total,
    ).toBeTypeOf("number");
  });

  it("records a provider-stage failure after successful web research without showing evidence pills", async () => {
    window.localStorage.setItem("agn.deepInfra.apiKey", "test-key");
    window.localStorage.setItem("agn.tavily.apiKey", "tavily-key");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          query: "search the web for current gravity research",
          results: [
            {
              title: "Research result",
              url: "https://example.com/research",
              content: "Current research evidence.",
              score: 0.9,
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ error: "DeepInfra upstream unavailable." }, { status: 502 }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ChatPanel sourceChunks={[]} />);
    await user.type(
      screen.getByLabelText("Ask a question"),
      "Search the web for current gravity research",
    );
    await user.click(screen.getByRole("button", { name: "Send question" }));

    await waitFor(() => {
      expect(screen.getAllByText("DeepInfra upstream unavailable.").length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole("link", { name: /Research result/ })).toBeNull();
    const stored = JSON.parse(
      window.localStorage.getItem("agn.chat.history") ?? "[]",
    ) as Array<{
      webResults: unknown[];
      diagnostics: { error?: { stage: string }; web: { resultCount: number } };
    }>;
    expect(stored[0]?.webResults).toHaveLength(1);
    expect(stored[0]?.diagnostics).toMatchObject({
      error: { stage: "provider" },
      web: { resultCount: 1 },
    });
  });
});
