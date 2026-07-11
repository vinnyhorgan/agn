import type { RetrievalMode } from "@/lib/search/retrieveSources";

export const HARNESS_VERSION = "0.2.0";

export interface RetrievalCandidateDiagnostic {
  chunkId: string;
  score?: number;
  matchedTerms: string[];
  selected: boolean;
}

export interface TurnDiagnostics {
  version: 1;
  harnessVersion: string;
  route: {
    kind: "deterministic";
    retrievalMode: RetrievalMode;
    webPolicy: "never" | "automatic" | "explicit";
  };
  retrieval: {
    query: string;
    previousEvidenceUsed: boolean;
    candidates: RetrievalCandidateDiagnostic[];
    selectedChunkIds: string[];
    selectedCharacters: number;
    expansions: Array<{ chunkId: string; reason: string }>;
  };
  context?: {
    catalogCharacters: number;
    localEvidenceCharacters: number;
    webEvidenceCharacters: number;
    historyCharacters: number;
    promptCharacters: number;
    estimatedPromptTokens: number;
    messageRoles: string[];
  };
  web: {
    attempted: boolean;
    resultCount: number;
  };
  timingsMs: {
    retrieval?: number;
    web?: number;
    promptAssembly?: number;
    timeToFirstToken?: number;
    total?: number;
  };
  error?: {
    stage: "web" | "prompt" | "provider" | "stream";
    message: string;
  };
}

export function estimateTokens(characters: number): number {
  return Math.ceil(characters / 4);
}
