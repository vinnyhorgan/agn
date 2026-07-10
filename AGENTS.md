# AGN Project Instructions

AGN means Actually-Good-Notebook.

AGN is a source-prioritized learning web app. It consumes SIR files, indexes their slide content, and lets users chat with a text-only LLM with those sources as its highest-priority context.

## Current phase

Build step by step. Do not add advanced features early.

Current milestones:

1. Clean project foundation.
2. SIR v1 validation.
3. SIR v1 import and parsing.
4. Slide viewer.
5. Source-grounded retrieval.
6. BYOK text-model chat.

Do not implement podcasts, quizzes, auth, payments, embeddings, agents, or background jobs until explicitly requested.

## Stack

Use:

- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- SQLite later
- Drizzle ORM later
- local filesystem storage for MVP
- Vitest for unit tests

This repo currently uses the top-level app directory, not src/app. Follow the existing structure unless explicitly asked to migrate.

## SIR v1 standard

A .sir file is a ZIP archive with this exact internal structure:

- manifest.json
- sir.md
- slides/
  - 0001.webp
  - 0002.webp
  - etc.

The files must be at the root of the archive. There must not be an extra wrapper folder.

manifest.json must contain exactly four fields:

- sir: integer 1
- title: string
- language: string
- slide_count: positive integer

No extra manifest fields are allowed.

sir.md contains slide sections marked by HTML comments:

<!-- slide: N -->

Slide N maps to:

slides/NNNN.webp

Example:

<!-- slide: 17 -->

maps to:

slides/0017.webp

## Product rule

AGN should behave like a capable general chat assistant while giving uploaded SIR sources the highest priority.

When uploaded sources support an answer, use and cite them. When the sources are insufficient, the assistant may answer from general knowledge but should briefly distinguish that information from uploaded-source content.

## SIR validation rules

Reject malformed SIR files with clear validation errors.

Validate:

- the file is a ZIP archive
- manifest.json exists at the root
- sir.md exists at the root
- slides/ exists
- manifest.json has exactly the four required fields
- manifest.sir equals 1
- manifest.slide_count is a positive integer
- sir.md contains exactly slide_count slide markers
- slide markers are consecutive from 1 to slide_count
- slides/ contains exactly slide_count WebP files
- slide image names are zero-padded and consecutive
- slide N maps to slides/NNNN.webp

Do not require the original PDF. AGN consumes only .sir files.

## Indexing rules

Every indexed source chunk must retain enough metadata to map back to:

- deck id
- deck title
- slide number
- slide title if available
- slide image path
- chunk text

## Chat rules

Claims based on retrieved source chunks must cite their source label and slide number.

The app should reject or repair model citations that do not map to real slides.

The model may use its own general knowledge when retrieved sources are insufficient. Web browsing is not part of the current product.

## LLM provider rules

AGN supports BYOK with DeepInfra as the only provider in the current phase.

Never log API keys.

Store the user's DeepInfra API key in browser localStorage so it persists between sessions. Never persist it on the server.

## Engineering rules

Use TypeScript.

Prefer simple, boring, type-safe code over clever abstractions.

Add tests for SIR validation and parsing.

Do not add dependencies unless they are needed for the current milestone.

Run lint/typecheck/tests after meaningful changes.
