// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatMessage } from "../../components/chat/ChatMessage";
import { ChatPanel } from "../../components/chat/ChatPanel";

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
    await user.click(screen.getByText("DeepInfra"));

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
});
