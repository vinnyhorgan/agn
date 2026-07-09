import type { SourceChunk } from "@/lib/search/types";

export type LlmMessageRole = "system" | "developer" | "user" | "assistant";

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface ProviderSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface GroundedPromptInput {
  question: string;
  sourceChunks: SourceChunk[];
}

export interface ChatCompletionRequest {
  model: string;
  messages: LlmMessage[];
  temperature: number;
}

export interface ChatCompletionResult {
  content: string;
}
