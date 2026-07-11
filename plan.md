# AGN Study Harness Plan

## Mission

AGN should reward the effort of compiling learning material into SIR by becoming
an exceptionally capable, comfortable, source-aware study partner. The harness
must make a strong but cost-efficient text model feel as if it has read the
student's complete library, understands the current conversation, can inspect
the right material on demand, and can express ideas using the representation
best suited to the subject.

The harness must remain:

- subject-neutral;
- source-prioritized without being source-limited;
- minimal on simple turns;
- bounded and predictable on difficult turns;
- local-first wherever possible;
- explicit about external web use in diagnostics, but natural in the chat UI;
- strict about citations, artifact structure, and provider compatibility;
- measurable by quality, latency, context use, and monetary cost.

The standard is not “good retrieval.” The standard is a coherent study
experience in which retrieval, web search, context limits, tool calls, and
validation are invisible implementation details unless the user asks about
them.

## Non-goals

The harness should not become:

- a general autonomous agent;
- an arbitrary code-execution environment;
- an image-generation product;
- a web browser that searches on every question;
- a collection of subject-specific hardcoded tutors;
- a framework with many overlapping tools and unpredictable loops;
- a system that treats model-generated summaries as authoritative evidence;
- a reason to add embeddings before measured lexical-retrieval failures justify
  them.

## Core principles

### Minimum sufficient work

Every turn should take the cheapest path that can produce an excellent answer.
Greeting the user should require no library context, retrieval, planning, or web
search. A difficult cross-source synthesis may justify planning, multiple local
searches, and a verification pass.

### Meaning before presentation

The model produces semantic structured text. AGN validates and renders it.
The model never generates executable HTML, arbitrary SVG, JavaScript, or visual
coordinates as the source of truth.

### Sources are shared memory

The complete library catalog defines what is uploaded. Retrieved evidence is
only the subset inspected for the current task. The assistant must never infer
that a source is missing merely because it was not retrieved.

### Claims require appropriate evidence

Uploaded SIR material has priority for course-specific facts and conventions.
Web evidence is used for current or external facts. General model knowledge is
allowed when neither is necessary or sufficient, with a natural distinction
when that distinction matters.

### Bounded agency

DeepSeek may plan searches and request narrowly defined study tools, but AGN
controls execution, budgets, validation, retries, and termination.

### Subject neutrality

Changing subjects should require a different SIR file, not application code.
ER diagrams are one structured artifact type, not a database-specific core
feature. Vocabulary expansion should be inferred from the corpus and model,
not maintained as a database glossary.

## Target turn pipeline

```text
User message
    ↓
Provider and request validation
    ↓
Deterministic fast-path classification
    ↓
Optional structured intent planner
    ↓
Task policy and context budget
    ↓
Local SIR retrieval plan
    ↓
Local search and direct slide reads
    ↓
Evidence sufficiency assessment
    ↓
Optional bounded refinement
    ↓
Optional Tavily search/extract escalation
    ↓
Compact evidence packet
    ↓
Final answer or structured artifact generation
    ↓
Citation, language, artifact, and claim validation
    ↓
Selective repair or one regeneration
    ↓
Streamed natural response
```

Internal work should not appear as separate assistant turns. The user should see
one coherent answer and, when useful, a quiet status such as “Checking your
sources” or “Searching the web,” without raw chain-of-thought or tool syntax.

## 1. Provider compatibility and request safety

### Requirements

- Maintain an explicit capability profile for each configured provider/model.
- Permit only roles accepted by the active endpoint.
- Normalize internal roles before sending provider requests.
- Validate messages, tool schemas, context size, and output parameters locally.
- Never discover incompatibilities only after a paid upstream request.
- Never log DeepInfra or Tavily API keys.
- Keep both keys in browser `localStorage` only.
- Send keys through server routes only for the relevant live request.
- Return actionable provider errors without exposing request bodies or secrets.

### DeepInfra profile

For the current model, emitted chat roles must be restricted to:

- `system`
- `user`
- `assistant`
- `tool` only when an actual supported tool-call loop is implemented

Dynamic harness context should be folded into the single system message.
Conversation history remains alternating user/assistant messages. The latest
user message remains a clean final user message.

### Regression tests

- No `developer` role reaches DeepInfra.
- Unsupported roles fail locally with status 400.
- Empty or oversized messages fail locally.
- Provider authentication failures map to stable user-facing errors.
- Tavily success followed by DeepInfra failure still produces a useful error
  and does not corrupt stored history.

## 2. Turn classification

### Supported intent families

- conversation and greetings;
- assistant identity and capabilities;
- runtime/provider questions;
- library inventory and navigation;
- exact source or slide lookup;
- focused factual lookup;
- conceptual explanation;
- cross-slide synthesis;
- cross-source comparison;
- exercise solving;
- student-answer evaluation;
- hint-only or Socratic tutoring;
- quiz or exam simulation;
- revision summary or study guide;
- artifact creation or modification;
- explicit web research;
- time-sensitive question;
- stable general-knowledge question.

### Two-level router

Use deterministic rules only for high-confidence cheap cases:

- greetings;
- identity and runtime model;
- explicit source labels and slide numbers;
- library listing;
- explicit web requests;
- obvious current/latest/news language;
- explicit artifact requests.

Use a small structured model call only when academic intent, evidence breadth,
or teaching mode is ambiguous.

### Router output

```json
{
  "intent": "explanation",
  "language": "en",
  "answer_depth": "standard",
  "study_mode": "teach",
  "source_scope": "library",
  "needs_local_evidence": true,
  "needs_catalog": false,
  "needs_adjacent_slides": true,
  "web_policy": "only_if_insufficient",
  "artifact": null,
  "max_research_rounds": 2
}
```

### Predictability requirements

- Router schemas are strict and versioned.
- Invalid router output falls back to a safe focused lookup.
- Every route has an explicit context and tool budget.
- Router decisions appear in diagnostic exports.
- Deterministic routes are unit tested with multilingual paraphrases.

## 3. Conversation and study state

Raw history is insufficient for reliable follow-ups. Maintain a compact,
browser-local conversation state derived from completed turns:

```json
{
  "active_topic": "candidate keys",
  "active_source_labels": ["Source 10"],
  "active_slides": [31, 32, 33],
  "student_goal": "prepare for exam",
  "study_mode": "explanation",
  "known_preferences": {
    "language": "en",
    "detail": "standard",
    "reveal_solutions": true
  },
  "unresolved_references": [],
  "last_artifact_id": null
}
```

### Rules

- Resolve “why?”, “the second one,” and “show another example” against active
  state before searching literal follow-up text.
- Current authoritative library state overrides incorrect claims in history.
- Keep only the recent turns required for discourse continuity.
- Do not resend old retrieved chunks automatically.
- Do not create opaque long-term psychological profiles.
- Let the user clear all conversation and derived state together.

## 4. Local SIR retrieval

### Retrieval stages

1. Normalize the question without changing meaning.
2. Resolve explicit source, title, path, or slide references.
3. Incorporate active conversation topic for follow-ups.
4. Generate at most two alternative search formulations when useful.
5. Run lexical searches locally, in parallel where independent.
6. Apply a relevance floor.
7. Deduplicate slides and near-duplicate content.
8. Select evidence according to task-specific coverage.
9. Expand strong anchors with useful neighboring slides.

### Search improvements

- Preserve exact identifiers, mathematical symbols, quoted phrases, and code.
- Weight source title, slide title, heading path, and body separately.
- Support exact phrase boosts.
- Record match terms and ranking scores.
- Detect repeated slide series and continuation titles.
- Prefer diversity for synthesis, but concentration for focused explanation.
- Avoid returning eight weak chunks merely because eight slots exist.
- Use previous evidence only when the current turn is a real follow-up.

### Query expansion

Expansion must be subject-neutral. Candidate terms may come from:

- the user's wording;
- source and slide titles;
- corpus vocabulary found near initial matches;
- acronyms and expanded forms proposed by the planner;
- earlier conversation terminology;
- language variants when the corpus and question use different languages.

No subject glossary should live in application code.

### Direct-read operations

The harness should support deterministic local operations:

- list sources;
- inspect one source's metadata and outline;
- search the library;
- read a slide;
- read a consecutive slide range;
- read adjacent slides;
- find other slides with the same or similar title;
- retrieve all chunks for a selected slide.

These are internal study tools, not general agent tools.

## 5. Slide-aware context expansion

Slides are ordered teaching units. Strong retrieval should trigger selective
context expansion.

### Expand when

- the slide title contains continuation markers;
- adjacent slides share a normalized title;
- the selected slide is an example and the previous slide is a definition;
- the selected slide is a definition and the next slide is an example;
- pronouns or references indicate missing antecedents;
- the question requests a walkthrough or derivation;
- a diagram description depends on a preceding legend.

### Do not expand when

- neighbors are section covers;
- neighboring text is unrelated;
- the focused answer is already fully supported;
- expansion would displace higher-value evidence.

Every expansion decision should be observable in diagnostics.

## 6. Hierarchical corpus representation

Raw chunks are not suitable for whole-library questions. Build deterministic,
local navigation structures during import:

- slide title index;
- source outline;
- repeated-title groups;
- heading hierarchy;
- source topic map derived extractively from titles and headings;
- deck-level source map.

### Authority model

- Original slide text is evidence.
- Manifest and `sources.json` are authoritative metadata.
- Extractive outlines are navigation aids.
- Any future model-generated summaries are caches and never authoritative
  citations.

### Uses

- source selection before chunk retrieval;
- corpus overviews;
- study-plan construction;
- coverage-aware quiz generation;
- targeted search inside a named source;
- avoiding arbitrary first-chunk summaries.

## 7. Evidence sufficiency and refinement

After initial retrieval, run a structured sufficiency check only when the route
is nontrivial or retrieval confidence is borderline.

```json
{
  "sufficient": false,
  "coverage": {
    "definition": true,
    "mechanism": true,
    "example": false,
    "exceptions": false
  },
  "missing": ["worked example"],
  "next_queries": ["worked example of the concept"],
  "slides_to_expand": [
    {"source_label": "Source 4", "slide": 18, "radius": 1}
  ],
  "web_needed": false
}
```

### Limits

- Fast path: zero sufficiency calls.
- Standard path: at most one refinement.
- Deep path: at most two refinements.
- No nested or unbounded calls.
- Stop when incremental evidence value is low.
- Never use web merely to fill an arbitrary evidence quota.

## 8. Context budgeting

Budgets must be token-aware and task-specific.

| Mode | Typical evidence policy |
| --- | --- |
| Conversation | No catalog or evidence |
| Library inventory | Compact authoritative catalog only |
| Exact slide | Requested slide plus necessary neighbor |
| Focused lookup | 3–6 strong chunks |
| Explanation | 6–12 chunks including useful neighbors |
| Exercise solving | Prompt, relevant rules, selected examples |
| Answer evaluation | Student answer, rubric evidence, references |
| Cross-source synthesis | 12–30 deliberately distributed chunks |
| Corpus overview | Hierarchical outlines and representative evidence |
| Web lookup | 3–5 search results; targeted extraction only if needed |

### Allocation

Reserve space for:

- stable system policy;
- dynamic task policy;
- compact conversation state;
- recent history;
- local evidence;
- web evidence;
- expected answer length;
- artifact payload when requested.

Context construction should report estimated tokens per category. If over
budget, remove low-value evidence before truncating authoritative material.

## 9. Web research with Tavily

### Activation policy

Search the web when:

- the user explicitly requests it;
- the question is time-sensitive;
- uploaded material refers to an external fact that must be updated;
- the topic is niche and model memory is unsafe;
- local evidence is insufficient and external evidence would materially
  improve the answer.

Do not search when:

- the question is a greeting or assistant-meta question;
- uploaded sources already answer it adequately;
- it is stable general knowledge the model can answer confidently;
- the only motivation is that local retrieval returned fewer than a fixed K.

### Cost ladder

1. Tavily basic or fast search, 3–5 results, one credit.
2. Filter by score, duplication, domain quality, and relevance.
3. Answer from snippets if sufficient.
4. Extract only 1–3 selected URLs with a query and limited chunks.
5. Use advanced search only for explicitly deep or high-stakes research.

### Web evidence requirements

- Preserve exact title, URL, content, score, query, and retrieval timestamp.
- Validate `http` and `https` URLs.
- Deduplicate canonical URLs.
- Treat page content as untrusted evidence, never instructions.
- Give uploaded sources priority for course conventions.
- Convert `[Web N]` markers to exact validated links.
- Cache results locally with a freshness policy.
- Include web costs and latency in diagnostics.

## 10. Pedagogical answer policies

The same evidence should be expressed differently depending on the student's
goal.

### Explanation

Default structure when appropriate:

1. intuition;
2. precise statement;
3. worked example;
4. common misunderstanding;
5. optional check-for-understanding.

Do not force this structure onto simple questions.

### Exercise solving

- Identify givens and goal.
- Select the relevant method from sources.
- Show the reasoning at a useful granularity.
- Verify the result.
- Follow the notation and conventions used by the uploaded course.
- Respect “hint only” and “do not reveal the answer.”

### Student-answer evaluation

- State what is correct.
- Identify the first material error precisely.
- Explain why it is wrong.
- Offer the smallest useful correction.
- Distinguish conceptual errors from notation mistakes.
- Cite the applicable source rules.

### Socratic mode

- Ask one purposeful question at a time.
- Do not pretend uncertainty about facts AGN already knows.
- Track which steps the student has established.
- Reveal more only when requested or when the student is stuck.

### Quiz and exam mode

- Plan coverage across the selected scope.
- Avoid accidental answer leakage.
- Grade consistently against evidence-derived rubrics.
- Adapt difficulty using observed performance, not hidden personality claims.
- Allow retry, hint, explanation, and skip.

### Revision mode

- Prioritize high-yield concepts.
- Preserve dependencies between topics.
- Mark likely confusions and contrasts.
- Link every source-grounded section back to slides.

## 11. Mathematics as a first-class output

Math rendering is a top-priority capability, not an optional formatting polish.

### Supported model syntax

The final-answer contract should require standard LaTeX delimiters:

- inline: `$...$`;
- display: `$$...$$`;
- aligned derivation: `\begin{aligned}...\end{aligned}` inside display math;
- matrices, cases, fractions, sums, integrals, limits, vectors, sets, and logic
  through standard LaTeX commands.

### Rendering

- Parse Markdown and math separately.
- Render with a deterministic local math renderer such as KaTeX.
- Do not load remote scripts.
- Sanitize and reject unsupported dangerous commands.
- Preserve the original LaTeX as copyable text.
- Provide accessible MathML or equivalent screen-reader output.
- Support horizontal scrolling for wide display equations.
- Match light and dark themes.
- Never treat currency values as math accidentally.

### Math validation

- Detect unbalanced delimiters before rendering.
- Attempt conservative delimiter repair.
- If parsing fails, display readable source text instead of a broken blank box.
- Keep code fences immune from math parsing.
- Test nested Markdown emphasis near math.
- Test multilingual prose around equations.

### Derivation policy

For derivations, the model should produce a structured sequence:

```json
{
  "artifact": "derivation",
  "version": 1,
  "steps": [
    {
      "expression": "x^2 - 5x + 6 = 0",
      "reason": "Original equation",
      "citations": []
    },
    {
      "expression": "(x-2)(x-3)=0",
      "reason": "Factorization",
      "citations": []
    }
  ]
}
```

AGN can render the derivation and its prose while retaining inspectable,
copyable semantics.

### Math study interactions

- explain notation;
- derive step by step;
- check a student's derivation;
- identify the first invalid transformation;
- provide hints without solving;
- render systems, matrices, piecewise functions, and proofs;
- cite source slides that define the method or theorem.

The harness remains subject-neutral: it understands expression structure and
validation, not hardcoded mathematical curricula.

## 12. Structured artifacts and visualizations

### Common envelope

All visual artifacts use a strict versioned block:

```json
{
  "artifact": "flowchart",
  "version": 1,
  "id": "artifact-1",
  "title": "Process overview",
  "language": "en",
  "provenance": [],
  "data": {}
}
```

The model emits the block inside an `agn-artifact` fence. AGN parses,
validates, stores, and renders it locally.

### Initial artifact types

1. comparison table;
2. flowchart;
3. concept graph;
4. hierarchy/tree;
5. timeline;
6. mathematical derivation;
7. entity-relationship diagram.

These cover broad study needs while keeping the renderer registry small.

### Later candidates

- state machine;
- argument map;
- causal diagram;
- sequence diagram;
- coordinate plot from explicit data/functions;
- reaction or pathway diagram using a safe domain notation;
- annotated text structure;
- study plan and dependency graph.

Each candidate requires real usage evidence before implementation.

### Validation rules

- Known artifact types and versions only.
- Strict field schemas; reject unknown fields where practical.
- Unique stable element IDs.
- All references resolve.
- Bounded nodes, edges, depth, labels, and total serialized size.
- No HTML, scripts, event handlers, arbitrary SVG, or executable URLs.
- Provenance references valid source slides or web results.
- Invalid artifacts fall back to readable structured text plus a concise error.

### Rendering rules

- Model specifies semantics, never pixel coordinates as the source of truth.
- Layout is deterministic and local.
- Render as accessible DOM/SVG created by AGN, not model-supplied SVG.
- Offer text equivalents.
- Allow copy of the structured representation.
- Allow SVG export only from AGN's renderer.
- Preserve artifacts across reloads with conversation history.
- Support focused fullscreen viewing without image generation.

### Artifact updates

Follow-up requests should patch semantic data:

```json
{
  "artifact_id": "artifact-1",
  "operations": [
    {
      "op": "replace",
      "path": "/data/nodes/student/label",
      "value": "Learner"
    }
  ]
}
```

AGN validates the patch against the current artifact and schema. The model does
not regenerate unrelated parts unless necessary.

## 13. Entity-relationship diagrams

ER support is implemented as one artifact plugin. It must not influence routing
or retrieval for unrelated subjects.

### Semantic support

- entities;
- attributes;
- identifiers;
- optional, multivalued, and composite attributes;
- relationships and relationship attributes;
- participant roles;
- minimum and maximum cardinalities;
- generalizations and specializations;
- total/partial and exclusive/overlapping constraints when represented by the
  selected notation.

### Workflow

1. Retrieve the requirements and relevant modeling conventions.
2. Extract candidate semantic elements.
3. Surface material ambiguity rather than silently inventing constraints.
4. Generate strict ER JSON.
5. Validate references and cardinalities.
6. Render locally.
7. Explain important modeling choices with citations.
8. Support semantic comparison with a student's diagram.

### Comparison output

- missing or extra entities;
- misplaced attributes;
- identifier differences;
- relationship differences;
- cardinality differences;
- specialization differences;
- alternative designs that are semantically acceptable.

The comparator should not grade purely by visual layout.

## 14. Artifact-neutral model tools

Expose only a compact tool surface:

- `search_library`
- `read_slide`
- `read_slide_range`
- `inspect_source`
- `list_sources`
- `search_web`
- `extract_web_pages`
- `create_artifact`
- `update_artifact`
- `validate_artifact`

Artifact type is an argument to the generic artifact tools. Do not expose a
separate tool for every subject or renderer unless reliability data proves it
necessary.

### Tool-loop limits

- Maximum one local tool round for standard turns.
- Maximum two refinement rounds for deep turns.
- Parallelize independent searches only.
- Reject nested unsupported calls.
- Validate arguments before execution.
- Return compact results with stable IDs.
- Never return raw archive bytes or API keys.
- Stop when evidence is sufficient.

## 15. Final answer construction

The final model receives only:

- stable assistant policy;
- selected task and pedagogical policy;
- clean latest user message;
- compact resolved conversation state;
- recent history required for discourse;
- relevant catalog entries only;
- selected local evidence;
- selected web evidence;
- artifact schema when an artifact is requested;
- explicit citation vocabulary.

It should not receive:

- the entire catalog on ordinary questions;
- irrelevant chunks;
- raw search diagnostics;
- hidden scoring rubrics unless evaluating an answer;
- provider errors from earlier turns;
- source material mixed into the latest user message.

## 16. Citation and claim verification

### Citation normalization

- Validate `[Source N, Slide M]` against real source-local slides.
- Split grouped citations into individually valid markers.
- Convert `[Web N]` into the exact stored URL and title.
- Remove invented or dangling citations.
- Retain mappings from displayed citations to deck/global slide/chunk IDs.

### Claim audit

For high-value or high-risk answers, run a bounded structured audit:

```json
{
  "unsupported_claims": [],
  "incorrect_citations": [],
  "missing_citations": [],
  "source_conflicts": [],
  "language_mismatch": false,
  "artifact_errors": []
}
```

### Repair policy

- Apply deterministic citation repairs first.
- Regenerate only for material unsupported claims, contradictions, language
  mismatch, or invalid artifacts.
- Allow at most one validation-triggered regeneration.
- Never silently change a student's quoted text.

## 17. Language handling

- Determine response language from the latest user message only, unless the
  user explicitly selects another language.
- Do not infer response language from source titles, paths, catalog metadata,
  web results, or old turns.
- Preserve mathematical and technical notation unchanged.
- Search across corpus languages using planner-proposed variants when useful.
- Keep artifact labels in the response language unless reproducing source
  terminology.
- Test code-switching and short ambiguous messages.

## 18. Performance, cost, and caching

### Fast path

One DeepInfra request, no tools:

- greetings;
- identity;
- simple catalog facts computed locally;
- stable general conversation;
- high-confidence direct answers with already active evidence.

### Standard path

- local retrieval;
- one final DeepInfra request;
- optional lightweight sufficiency planning only when confidence is low.

### Deep path

- structured plan;
- bounded retrieval refinement;
- optional Tavily escalation;
- final answer;
- optional audit.

### Caches

- parsed SIR data and outlines in IndexedDB;
- lexical index in memory, reconstructable locally;
- normalized query and retrieval results per library version;
- Tavily search results with timestamp and query;
- targeted Tavily extraction by canonical URL/query;
- artifact layouts derived deterministically from semantic JSON;
- optional source-summary caches clearly marked non-authoritative.

### Cache invalidation

- Include library content hashes in local retrieval cache keys.
- Invalidate catalog and outline caches when a deck is added or removed.
- Use freshness windows appropriate to Tavily query intent.
- Never cache API keys in request payload caches.

## 19. Streaming and interaction design

- Stream only the final natural answer.
- Before final streaming, show concise status transitions when work is slow:
  “Checking your sources,” “Reading related slides,” or “Searching the web.”
- Do not expose chain-of-thought, raw tool calls, or ranking scores in normal UI.
- Let Stop cancel Tavily, DeepInfra, and local refinement together.
- A stopped turn must retain partial text and evidence safely.
- Never show “No response received” without the actionable failure reason.
- Provider failures should not leave misleading source or web pills presented as
  if an answer succeeded.
- Allow retry without duplicating the user turn.

## 20. Observability and diagnostic exports

Diagnostic exports should become complete enough to reproduce harness failures
without including secrets.

### Per-turn fields

- harness version;
- runtime model/provider;
- user message;
- detected language;
- selected intent and study mode;
- deterministic versus model-planned route;
- catalog entries included;
- normalized and expanded search queries;
- ranked local candidates with scores and matched terms;
- selected chunks and expansion reasons;
- evidence token estimates;
- sufficiency decision and missing coverage;
- tool calls and bounded-round count;
- Tavily query, results, depth, credits, and latency;
- final prompt message roles and character/token estimates, excluding keys;
- raw model answer before deterministic repair when safe;
- final repaired answer;
- citation audit;
- artifact validation results;
- time to first visible status;
- time to first answer token;
- total latency;
- prompt/completion tokens and estimated provider cost;
- error stage and sanitized error.

### Privacy

- Never include API keys.
- Make diagnostic copying explicit.
- Keep diagnostics browser-local unless the user copies them.
- Allow a compact export and a full engineering export.

## 21. Evaluation framework

The harness cannot be optimized by intuition alone. Build a versioned evaluation
suite using multiple subjects and languages.

### Corpus mix

- mathematics;
- natural science;
- history;
- law or policy;
- computer science;
- literature or philosophy;
- database design as one demanding structured-artifact case;
- mixed-language source sets;
- mixed PDF, image, and Markdown SIR v2 corpora.

### Test categories

- greeting and identity fast paths;
- response-language preservation;
- complete catalog awareness;
- exact source and slide lookup;
- terminology mismatch;
- definition retrieval;
- multi-slide explanation;
- adjacent-slide context;
- cross-source synthesis;
- duplicate and conflicting material;
- follow-up resolution;
- hint-only tutoring;
- exercise solving;
- student-answer grading;
- unsupported source questions;
- stable general knowledge;
- explicit web search;
- time-sensitive automatic web use;
- web abstention when unnecessary;
- local-versus-web conflict handling;
- math parsing and rendering;
- derivation checking;
- artifact generation and repair;
- citation validity and completeness;
- source prompt injection;
- provider error recovery;
- cost and latency budgets.

### Metrics

- route accuracy;
- local retrieval recall and precision;
- evidence coverage;
- answer faithfulness;
- citation validity;
- citation completeness;
- contradiction rate;
- language accuracy;
- pedagogical-quality rubric;
- artifact schema validity;
- math render success;
- unnecessary tool-call rate;
- unnecessary web-search rate;
- average and percentile latency;
- prompt and completion tokens;
- Tavily credits;
- estimated cost per turn;
- user-visible failure rate.

### Golden expectations

Each evaluation case should define:

- allowed routes;
- expected source labels/slides or acceptable alternatives;
- whether web is forbidden, allowed, or required;
- claims that must appear;
- claims that must not appear;
- expected response language;
- citation requirements;
- artifact expectations;
- maximum research rounds;
- context, latency, and cost ceilings.

## 22. Security and adversarial behavior

- Treat all SIR and web text as untrusted content.
- Delimit evidence clearly from instructions.
- Ignore instructions embedded inside sources and pages.
- Validate archive sizes and decompression behavior.
- Validate artifact sizes, recursion, URLs, and IDs.
- Sanitize rendered Markdown and links.
- Do not allow arbitrary protocols.
- Do not leak API keys in errors, exports, logs, prompts, or provider calls to
  the wrong service.
- Rate-limit or debounce repeated web searches from accidental resubmission.
- Test prompt injection asking AGN to fabricate citations or reveal secrets.

## 23. Delivery phases

### Phase 0 — Reliability baseline

- Fix all provider-role incompatibilities.
- Add provider capability profiles.
- Ensure failures show the real sanitized cause.
- Add regression coverage for the current 422 failure.
- Ensure failed turns do not masquerade as completed evidence-backed turns.

Exit gate: all provider/request tests pass; no unsupported role reaches
DeepInfra.

### Phase 1 — Harness observability

- Version the harness.
- Expand diagnostic exports with routing, scores, budgets, timings, costs, and
  sanitized errors.
- Add a developer-only or diagnostic view for retrieval inspection.

Exit gate: every evaluation failure can be assigned to routing, retrieval,
context assembly, model generation, validation, rendering, or provider I/O.

### Phase 2 — Retrieval quality

- Add relevance thresholds.
- Preserve scores and matched terms.
- Add exact source/slide routing.
- Add query normalization and bounded expansion.
- Add duplicate suppression.
- Add adjacent-slide expansion.
- Add source outlines.

Exit gate: focused and explanation retrieval meet defined recall/precision
targets on at least three subjects.

### Phase 3 — Bounded research controller

- Add strict intent-plan schema.
- Add task budgets.
- Add evidence sufficiency checks.
- Add one standard refinement pass.
- Add compact conversation research state.

Exit gate: difficult questions improve materially while simple-turn latency and
cost remain unchanged.

### Phase 4 — Pedagogical modes

- Add explanation, exercise, answer evaluation, Socratic, quiz, exam, and
  revision policies.
- Add user-visible mode controls only where inference is unreliable.

Exit gate: pedagogical rubrics improve without forcing canned templates onto
ordinary conversation.

### Phase 5 — Math rendering

- Add safe Markdown math parsing.
- Add local KaTeX rendering and accessibility.
- Add delimiter repair and fallback.
- Add structured derivation artifacts.
- Add math-specific regression corpus.

Exit gate: common inline/display expressions, matrices, cases, alignments, and
derivations render correctly across themes and mobile layouts.

### Phase 6 — General artifact engine

- Implement `agn-artifact` parsing.
- Add common envelope, schema registry, validation, persistence, and fallback.
- Implement tables, flowcharts, concept graphs, hierarchies, and timelines.
- Add deterministic accessible rendering and export.

Exit gate: malformed artifacts never execute or break chat; valid artifacts
survive reloads and remain copyable as structured text.

### Phase 7 — ER artifact plugin

- Add ER semantic schema and validator.
- Add deterministic layout and rendering.
- Add semantic update and comparison.
- Test against database material without changing core routing.

Exit gate: ER support is fully removable as a plugin without affecting other
subjects.

### Phase 8 — Tavily research escalation

- Add score/domain filtering and canonical deduplication.
- Add targeted Extract calls with query-focused chunk limits.
- Add caching and freshness policies.
- Add external-evidence sufficiency and citation audits.

Exit gate: web-backed answers improve current/niche evaluations while web use,
latency, and credits stay inside budgets.

### Phase 9 — Verification and selective regeneration

- Add high-risk claim audit.
- Add artifact and language audit.
- Add one bounded regeneration path.

Exit gate: citation and unsupported-claim failures decrease enough to justify
the additional calls on audited routes.

### Phase 10 — Empirical optimization

- Run the full multi-subject suite.
- Remove calls and abstractions that do not produce measurable value.
- Tune thresholds and budgets from collected evidence.
- Document stable harness behavior and remaining failure modes.

Exit gate: quality, latency, context use, cost, precision, and reliability meet
published targets rather than subjective impressions.

## 24. Immediate implementation order

1. Lock provider role compatibility and error regression tests.
2. Make failed-turn UI and diagnostics truthful.
3. Add full harness observability.
4. Improve local retrieval and adjacent-slide behavior.
5. Introduce the bounded planner/sufficiency loop.
6. Add math rendering before broad artifact work.
7. Build the generic artifact engine.
8. Add ER as the first specialized artifact plugin.
9. Complete Tavily targeted extraction and caching.
10. Add verification only where evaluations justify its cost.

## Definition of success

AGN is successful when:

- simple interactions feel instant and natural;
- the assistant reliably knows what is in the complete library;
- focused questions retrieve the right evidence rather than filling a quota;
- explanations assemble definitions, context, and examples coherently;
- follow-ups preserve the topic without redundant retrieval;
- course-specific answers follow uploaded conventions;
- unsupported questions receive capable general answers without fake sourcing;
- current questions use the web when needed and only when needed;
- citations always map to real slides or exact web pages;
- mathematical notation renders beautifully and remains copyable;
- diagrams and other visuals come from validated structured text;
- adding a new subject requires no subject-specific code;
- difficult tasks can use bounded tools without turning every turn into an
  agent loop;
- diagnostics make every failure understandable;
- measured quality improves without uncontrolled increases in latency, tokens,
  Tavily credits, or complexity.

The governing rule is: perform the minimum sufficient work, but never stop
before the evidence and representation are good enough to teach effectively.
