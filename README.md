# AGN

Actually-Good-Notebook is a local-first learning workspace for SIR slide decks. Upload `.sir` archives, search and inspect their slides, and chat with DeepInfra while giving uploaded material first priority.

## Current capabilities

- Strict SIR v1 deck and SIR v2 mixed-corpus validation and parsing
- Multi-deck slide viewing with local WebP previews
- Persistent browser-local deck library and reading position
- Unicode-aware BM25 search with slide-level metadata
- Streaming multi-turn DeepInfra chat with source-prioritized context
- Locally persisted conversation history
- Verified, clickable source and slide citations
- Browser-persisted BYOK API key
- Responsive source, chat, and preview workspace

## Getting started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
```

## SIR

A SIR v2 `.sir` file normalizes PDFs, images, and Markdown into one
source-aware corpus while retaining a global slide sequence:

```text
manifest.json
sources.json
sir.md
slides/
  0001.webp
  0002.webp
```

Legacy single-deck SIR v1 archives remain supported. Use the in-app Generate
SIR prompt to compile a mixed corpus ZIP with ChatGPT.

See [AGENTS.md](./AGENTS.md) for the complete format and engineering rules.

## Privacy

SIR parsing, slide images, indexing, and retrieval stay in the browser. The DeepInfra API key is stored in browser `localStorage` and is sent through AGN's server route only when making a chat request. It is never persisted server-side or logged by application code.
