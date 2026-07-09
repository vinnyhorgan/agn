"use client";

import { AlertCircle, Loader2, Send } from "lucide-react";
import { useMemo, useState } from "react";

import { ChatMessage } from "@/components/chat/ChatMessage";
import { ProviderSettings } from "@/components/chat/ProviderSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildGroundedMessages } from "@/lib/llm/groundedPrompt";
import { createOpenAiCompatibleChatCompletion } from "@/lib/llm/openAiCompatible";
import type { ProviderSettings as ProviderSettingsValue } from "@/lib/llm/types";
import { lexicalSearch } from "@/lib/search/lexicalSearch";
import type { SourceChunk } from "@/lib/search/types";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  sourceChunks: SourceChunk[];
  onSelectSlide: (slideNumber: number) => void;
}

interface ChatTurn {
  id: string;
  question: string;
  answer?: string;
  sources: SourceChunk[];
}

const retrievalLimit = 6;
const defaultProviderSettings: ProviderSettingsValue = {
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: "",
  model: "openai/gpt-4.1-mini",
};

export function ChatPanel({ sourceChunks, onSelectSlide }: ChatPanelProps) {
  const [settings, setSettings] = useState<ProviderSettingsValue>(
    defaultProviderSettings,
  );
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const latestTurn = turns[0];
  const validSlideNumbers = useMemo(
    () =>
      latestTurn
        ? new Set(latestTurn.sources.map((source) => source.slideNumber))
        : undefined,
    [latestTurn],
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || isLoading) {
      return;
    }

    const sources = lexicalSearch(
      sourceChunks,
      trimmedQuestion,
      retrievalLimit,
    ).map((result) => result.chunk);

    if (sources.length === 0) {
      setError("No relevant source was found in the currently loaded deck.");
      setTurns([
        {
          id: crypto.randomUUID(),
          question: trimmedQuestion,
          sources: [],
        },
        ...turns,
      ]);
      return;
    }

    setIsLoading(true);
    setError(undefined);

    try {
      const messages = buildGroundedMessages({
        question: trimmedQuestion,
        sourceChunks: sources,
      });
      const response = await createOpenAiCompatibleChatCompletion({
        settings,
        messages,
      });

      setTurns([
        {
          id: crypto.randomUUID(),
          question: trimmedQuestion,
          answer: response.content,
          sources,
        },
        ...turns,
      ]);
      setQuestion("");
    } catch (chatError) {
      setError(
        chatError instanceof Error
          ? chatError.message
          : "Could not complete the provider request.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="rounded-lg bg-white">
      <CardHeader className="border-b border-zinc-200">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Chat with Sources</CardTitle>
            <CardDescription>
              Sends only retrieved chunks from this deck to your provider.
            </CardDescription>
          </div>
          <Badge variant="outline">{sourceChunks.length} chunks</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ProviderSettings settings={settings} onChange={setSettings} />

        <form className="grid gap-2" onSubmit={handleSubmit}>
          <label className="grid gap-1.5 text-sm font-medium text-zinc-700">
            Question
            <textarea
              value={question}
              rows={3}
              placeholder="Ask about the loaded deck"
              disabled={isLoading || sourceChunks.length === 0}
              className="min-h-24 w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm leading-6 outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs leading-5 text-zinc-500">
              Retrieval uses lexical search over the current deck, top{" "}
              {retrievalLimit}.
            </p>
            <Button
              type="submit"
              disabled={isLoading || !question.trim() || sourceChunks.length === 0}
            >
              {isLoading ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Send aria-hidden="true" />
              )}
              Send
            </Button>
          </div>
        </form>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm leading-6 text-destructive">
            <AlertCircle className="mt-1 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}

        {latestTurn ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="grid gap-2">
              <ChatMessage role="user" content={latestTurn.question} />
              {latestTurn.answer ? (
                <ChatMessage
                  role="assistant"
                  content={latestTurn.answer}
                  validSlideNumbers={validSlideNumbers}
                />
              ) : (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-600">
                  No model call was made for this question.
                </div>
              )}
            </div>
            <RetrievedSources
              sources={latestTurn.sources}
              onSelectSlide={onSelectSlide}
            />
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-zinc-200 px-3 py-6 text-center text-sm text-zinc-600">
            Ask a question to retrieve source chunks and generate a cited answer.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RetrievedSources({
  sources,
  onSelectSlide,
}: {
  sources: SourceChunk[];
  onSelectSlide: (slideNumber: number) => void;
}) {
  return (
    <div className="rounded-lg border border-zinc-200">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-2">
        <h3 className="text-sm font-medium text-zinc-950">Retrieved sources</h3>
        <Badge variant="secondary">{sources.length}</Badge>
      </div>
      {sources.length > 0 ? (
        <ScrollArea className="h-[340px]">
          <div className="grid gap-2 p-2">
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                className={cn(
                  "rounded-lg border border-zinc-200 px-3 py-2 text-left transition-colors hover:border-zinc-950 hover:bg-zinc-50",
                  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                )}
                onClick={() => onSelectSlide(source.slideNumber)}
              >
                <span className="block text-xs font-medium text-zinc-500">
                  Slide {source.slideNumber}
                </span>
                <span className="mt-1 block line-clamp-1 text-sm font-medium text-zinc-950">
                  {source.slideTitle ?? "Untitled slide"}
                </span>
                {source.headingPath?.length ? (
                  <span className="mt-1 block line-clamp-1 text-xs text-zinc-500">
                    {source.headingPath.join(" / ")}
                  </span>
                ) : null}
                <span className="mt-1 block line-clamp-5 text-sm leading-6 text-zinc-700">
                  {source.text}
                </span>
              </button>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <p className="px-3 py-4 text-sm leading-6 text-zinc-600">
          No relevant source was found.
        </p>
      )}
    </div>
  );
}
