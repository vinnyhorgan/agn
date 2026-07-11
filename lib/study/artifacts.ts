import type { StudyArtifact, StudyHierarchyNode } from "@/lib/study/types";

const maxNodes = 40;
const maxRows = 30;

export interface StudyContentPart {
  type: "markdown" | "artifact";
  content?: string;
  artifact?: StudyArtifact;
  error?: string;
}

export function parseStudyContent(content: string): StudyContentPart[] {
  content = repairIncompleteArtifactFences(normalizeArtifactFences(content));
  const pattern = /```\s*agn-artifact\s*\n([\s\S]*?)```/gi;
  const parts: StudyContentPart[] = [];
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: "markdown", content: content.slice(cursor, index) });
    try {
      parts.push({ type: "artifact", artifact: validateStudyArtifact(parseArtifactJson(match[1]!)) });
    } catch (error) {
      parts.push({
        type: "artifact",
        error: error instanceof Error ? error.message : "Invalid study artifact.",
        content: match[1],
      });
    }
    cursor = index + match[0].length;
  }
  if (cursor < content.length) parts.push({ type: "markdown", content: content.slice(cursor) });
  return parts.length > 0 ? parts : [{ type: "markdown", content }];
}

export function repairIncompleteArtifactFences(content: string): string {
  const opening = /```\s*(?:agn-artifact|json)\s*\n/gi;
  let cursor = 0;
  let repaired = "";
  while (cursor < content.length) {
    opening.lastIndex = cursor;
    const match = opening.exec(content);
    if (!match) return repaired + content.slice(cursor);
    repaired += content.slice(cursor, match.index);
    const bodyStart = match.index + match[0].length;
    const closing = content.indexOf("```", bodyStart);
    if (closing >= 0) {
      repaired += content.slice(match.index, closing + 3);
      cursor = closing + 3;
      continue;
    }
    const jsonStart = content.indexOf("{", bodyStart);
    const jsonEnd = jsonStart >= 0 ? findBalancedJsonEnd(content, jsonStart) : -1;
    if (jsonEnd >= 0) {
      const body = content.slice(jsonStart, jsonEnd + 1);
      try {
        const parsed = JSON.parse(body) as { artifact?: unknown };
        if (typeof parsed.artifact === "string") {
          repaired += `\`\`\`agn-artifact\n${body}\n\`\`\``;
          cursor = jsonEnd + 1;
          continue;
        }
      } catch { /* Leave malformed output readable below. */ }
    }
    repaired += "Diagram generation was interrupted.\n\n";
    cursor = bodyStart;
  }
  return repaired;
}

function findBalancedJsonEnd(content: string, start: number): number {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) return index;
  }
  return -1;
}

export function normalizeArtifactFences(content: string): string {
  return content.replace(/```json\s*\n([\s\S]*?)```/gi, (block, body: string) => {
    try {
      const parsed = parseArtifactJson(body) as { artifact?: unknown };
      return parsed?.artifact === "flowchart" || parsed?.artifact === "hierarchy" || parsed?.artifact === "comparison" || parsed?.artifact === "table" || parsed?.artifact === "er-diagram"
        ? `\`\`\`agn-artifact\n${body.trim()}\n\`\`\``
        : block;
    } catch {
      return block;
    }
  });
}

export function validateStudyArtifact(value: unknown): StudyArtifact {
  if (!value || typeof value !== "object") throw new Error("Artifact must be an object.");
  const item = value as Record<string, unknown>;
  if (item.version !== 1) throw new Error("Unsupported artifact version.");
  const title = text(item.title, "Untitled diagram");

  if (item.artifact === "flowchart") {
    if (!Array.isArray(item.nodes) || !Array.isArray(item.edges) || item.nodes.length > maxNodes) {
      throw new Error("Invalid or oversized flowchart.");
    }
    const nodes = item.nodes.map((node) => {
      const record = object(node);
      return { id: text(record.id), label: text(record.label) };
    });
    const ids = new Set(nodes.map((node) => node.id));
    if (ids.size !== nodes.length) throw new Error("Flowchart node IDs must be unique.");
    const edges = item.edges.map((edge) => {
      const record = object(edge);
      const from = text(record.from);
      const to = text(record.to);
      if (!ids.has(from) || !ids.has(to)) throw new Error("Flowchart edge has an unknown node.");
      return { from, to, ...(typeof record.label === "string" ? { label: text(record.label) } : {}) };
    });
    return { artifact: "flowchart", version: 1, title, nodes, edges };
  }

  if (item.artifact === "hierarchy") {
    let count = 0;
    const parseNode = (node: unknown, depth = 0): StudyHierarchyNode => {
      if (depth > 6 || ++count > maxNodes) throw new Error("Hierarchy is too large.");
      const record = object(node);
      return {
        label: text(record.label),
        ...(Array.isArray(record.children)
          ? { children: record.children.map((child) => parseNode(child, depth + 1)) }
          : {}),
      };
    };
    return { artifact: "hierarchy", version: 1, title, root: parseNode(item.root) };
  }

  if (item.artifact === "comparison" || item.artifact === "table") {
    if (!Array.isArray(item.columns) || !Array.isArray(item.rows) || item.rows.length > maxRows) {
      throw new Error("Invalid or oversized comparison table.");
    }
    const columns = item.columns.map((column) => text(column));
    if (columns.length < 2 || columns.length > 8) throw new Error("Comparison needs 2-8 columns.");
    const rows = item.rows.map((row) => {
      if (!Array.isArray(row) || row.length !== columns.length) throw new Error("Comparison row width is invalid.");
      return row.map((cell) => text(cell));
    });
    return { artifact: item.artifact, version: 1, title, columns, rows };
  }

  if (item.artifact === "er-diagram") {
    if (!Array.isArray(item.entities) || !Array.isArray(item.relationships) || item.entities.length > 20) {
      throw new Error("Invalid or oversized ER diagram.");
    }
    const entities = item.entities.map((entity) => {
      const record = object(entity);
      const rawAttributes = normalizeErAttributes(record.attributes);
      if (rawAttributes.length > 20) throw new Error("Invalid ER entity attributes.");
      return {
        id: text(record.id),
        name: text(record.name),
        attributes: rawAttributes.map((attribute) => {
          if (typeof attribute === "string") return { name: text(attribute) };
          const value = object(attribute);
          return { name: text(value.name), ...(value.key === true || value.key === "true" ? { key: true } : {}) };
        }),
      };
    });
    const ids = new Set(entities.map((entity) => entity.id));
    if (ids.size !== entities.length) throw new Error("ER entity IDs must be unique.");
    const relationships = item.relationships.map((relationship) => {
      const record = object(relationship);
      const from = text(record.from);
      const to = text(record.to);
      if (!ids.has(from) || !ids.has(to)) throw new Error("ER relationship has an unknown entity.");
      return {
        from, to, label: text(record.label),
        ...(typeof record.fromCardinality === "string" ? { fromCardinality: text(record.fromCardinality) } : {}),
        ...(typeof record.toCardinality === "string" ? { toCardinality: text(record.toCardinality) } : {}),
      };
    });
    return { artifact: "er-diagram", version: 1, title, entities, relationships };
  }

  throw new Error("Unknown study artifact type.");
}

function normalizeErAttributes(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return value.split(",").map((attribute) => attribute.trim()).filter(Boolean);
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).map(([name, details]) =>
      typeof details === "object" && details !== null
        ? { name, ...(details as Record<string, unknown>) }
        : { name },
    );
  }
  throw new Error("Invalid ER entity attributes.");
}

/** Recover the small set of JSON punctuation mistakes text models commonly make. */
function parseArtifactJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch (originalError) {
    const repaired = value
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/([}\]])\s*(?=[{\[])/g, "$1,")
      .replace(/([}\]\"])\s*(?=\"[^\"]+\"\s*:)/g, "$1,");
    try {
      return JSON.parse(repaired);
    } catch {
      throw originalError;
    }
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid artifact object.");
  return value as Record<string, unknown>;
}

function text(value: unknown, fallback?: string): string {
  if (typeof value !== "string" || !value.trim()) {
    if (fallback !== undefined) return fallback;
    throw new Error("Artifact text cannot be empty.");
  }
  return value.trim().slice(0, 300);
}
