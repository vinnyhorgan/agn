import type { SourceChunk } from "@/lib/search/types";

export type LlmMessageRole = "system" | "developer" | "user" | "assistant";

export interface LlmMessage {
  role: LlmMessageRole;
  content: string;
}

export interface DeepInfraSettings {
  apiKey: string;
}

export interface GroundedPromptInput {
  question: string;
  sourceChunks: SourceChunk[];
}

export interface ChatCompletionRequest {
  model: string;
  messages: LlmMessage[];
  temperature: number;
  reasoning_effort?: "low" | "medium" | "high";
}

export interface ChatCompletionResult {
  content: string;
}
