"use client";

import { AlertCircle, Loader2, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ChatMessage } from "@/components/chat/ChatMessage";
import { ProviderSettings } from "@/components/chat/ProviderSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { buildGroundedMessages } from "@/lib/llm/groundedPrompt";
import { createDeepInfraChatCompletionViaRoute } from "@/lib/llm/openAiCompatible";
import type { DeepInfraSettings } from "@/lib/llm/types";
import { lexicalSearch } from "@/lib/search/lexicalSearch";
import type { SourceChunk } from "@/lib/search/types";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  sourceChunks: SourceChunk[];
  sourceCount?: number;
  onSelectSource?: (source: {
    deckId: string;
    slideNumber: number;
    chunkId?: string;
  }) => void;
  onSelectSlide?: (slideNumber: number) => void;
}

interface ChatTurn {
  id: string;
  question: string;
  answer?: string;
  sources: SourceChunk[];
}

const retrievalLimit = 6;
const deepInfraApiKeyStorageKey = "agn.deepInfra.apiKey";
const defaultDeepInfraSettings: DeepInfraSettings = {
  apiKey: "",
};

const missingApiKeyMessage = "Add a valid DeepInfra API key before chatting.";

function readStoredDeepInfraApiKey(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage.getItem(deepInfraApiKeyStorageKey) ?? undefined;
  } catch {
    return undefined;
  }
}

export function ChatPanel({
  sourceChunks,
  sourceCount,
  onSelectSource,
  onSelectSlide,
}: ChatPanelProps) {
  const [settings, setSettings] = useState<DeepInfraSettings>(() => ({
    apiKey: readStoredDeepInfraApiKey() ?? defaultDeepInfraSettings.apiKey,
  }));
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const hasSources = sourceChunks.length > 0;

  useEffect(() => {
    try {
      if (settings.apiKey) {
        window.localStorage.setItem(deepInfraApiKeyStorageKey, settings.apiKey);
      } else {
        window.localStorage.removeItem(deepInfraApiKeyStorageKey);
      }
    } catch {
      // Keep chat usable even if the browser blocks localStorage writes.
    }
  }, [settings.apiKey]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isLoading) {
      return;
    }

    if (!settings.apiKey.trim()) {
      setError(missingApiKeyMessage);
      return;
    }

    const sources = hasSources
      ? lexicalSearch(sourceChunks, trimmedQuestion, retrievalLimit).map(
          (result) => result.chunk,
        )
      : [];

    setIsLoading(true);
    setError(undefined);

    try {
      const messages = buildGroundedMessages({
        question: trimmedQuestion,
        sourceChunks: sources,
      });
      const response = await createDeepInfraChatCompletionViaRoute({
        settings,
        messages,
      });

      setTurns((currentTurns) => [
        ...currentTurns,
        {
          id: crypto.randomUUID(),
          question: trimmedQuestion,
          answer: response.content,
          sources,
        },
      ]);
      setQuestion("");
    } catch (chatError) {
      setError(
        chatError instanceof Error
          ? chatError.message
          : "Could not complete the DeepInfra request.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  function selectSource(source: SourceChunk) {
    onSelectSource?.({
      deckId: source.deckId,
      slideNumber: source.slideNumber,
      chunkId: source.id,
    });
    onSelectSlide?.(source.slideNumber);
  }

  function handleQuestionKeyDown(
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-zinc-950">
      <header className="flex min-h-14 items-center justify-between gap-3 border-b border-zinc-800 px-4">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold text-zinc-50">
            Source-grounded chat
          </h1>
          <p className="truncate text-xs text-zinc-500">
            DeepInfra prioritizes uploaded SIR sources when relevant.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant="outline" className="border-zinc-800 text-zinc-300">
            {sourceCount ?? 0} source{(sourceCount ?? 0) === 1 ? "" : "s"}
          </Badge>
          <ProviderSettings settings={settings} onChange={setSettings} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {turns.length === 0 ? (
          <div className="flex h-full min-h-[320px] items-center justify-center text-center">
            <div className="max-w-md">
              <h2 className="text-lg font-semibold text-zinc-100">
                Ask anything
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-400">
                Uploaded SIR sources are retrieved first and cited when they
                support the answer.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-5">
            {turns.map((turn) => (
              <ChatTurnView
                key={turn.id}
                turn={turn}
                onSelectSource={selectSource}
              />
            ))}
          </div>
        )}
      </div>

      <footer className="border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        {error ? (
          <div className="mx-auto mb-3 flex max-w-3xl items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm leading-6 text-destructive">
            <AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        {!hasSources ? (
          <p className="mx-auto mb-2 max-w-3xl text-xs text-zinc-500">
            Upload SIR sources to prioritize deck knowledge in answers.
          </p>
        ) : null}
        <form className="mx-auto flex max-w-3xl items-end gap-2" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="chat-question">
            Ask a source-grounded question
          </label>
          <textarea
            id="chat-question"
            value={question}
            rows={2}
            placeholder={
              hasSources
                ? "Ask anything; SIR sources are prioritized"
                : "Ask anything, or upload SIR sources for deck-grounded answers"
            }
            disabled={isLoading}
            className="max-h-36 min-h-14 flex-1 resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm leading-6 text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus-visible:border-zinc-600 focus-visible:ring-3 focus-visible:ring-zinc-700/50 disabled:pointer-events-none disabled:opacity-50"
            onKeyDown={handleQuestionKeyDown}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <Button
            type="submit"
            size="icon-lg"
            disabled={isLoading || !question.trim()}
            aria-label="Send question"
          >
            {isLoading ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Send aria-hidden="true" />
            )}
          </Button>
        </form>
      </footer>
    </section>
  );
}

function ChatTurnView({
  turn,
  onSelectSource,
}: {
  turn: ChatTurn;
  onSelectSource: (source: SourceChunk) => void;
}) {
  const validSlideNumbers = useMemo(
    () => new Set(turn.sources.map((source) => source.slideNumber)),
    [turn.sources],
  );

  function selectCitation(slideNumber: number) {
    const matchingSource = turn.sources.find(
      (source) => source.slideNumber === slideNumber,
    );

    if (matchingSource) {
      onSelectSource(matchingSource);
    }
  }

  return (
    <article className="flex flex-col gap-2">
      <ChatMessage role="user" content={turn.question} />
      {turn.answer ? (
        <ChatMessage
          role="assistant"
          content={turn.answer}
          validSlideNumbers={validSlideNumbers}
          onCitationClick={selectCitation}
        />
      ) : null}
      {turn.sources.length > 0 ? (
        <RetrievedSources sources={turn.sources} onSelectSource={onSelectSource} />
      ) : null}
    </article>
  );
}

function RetrievedSources({
  sources,
  onSelectSource,
}: {
  sources: SourceChunk[];
  onSelectSource: (source: SourceChunk) => void;
}) {
  return (
    <div className="mr-auto flex max-w-[86%] flex-wrap gap-2">
      {sources.map((source) => (
        <button
          key={source.id}
          type="button"
          className={cn(
            "min-w-0 max-w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-zinc-600 hover:bg-zinc-800",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          )}
          onClick={() => onSelectSource(source)}
        >
          <span className="block truncate font-medium text-zinc-200">
            {source.sourceLabel ? `${source.sourceLabel} · ` : ""}
            {source.deckTitle}
          </span>
          <span className="mt-0.5 block truncate text-zinc-500">
            Slide {source.slideNumber}
            {source.slideTitle ? ` · ${source.slideTitle}` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}
