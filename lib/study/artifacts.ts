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
  content = normalizeArtifactFences(content);
  const pattern = /```agn-artifact\s*\n([\s\S]*?)```/gi;
  const parts: StudyContentPart[] = [];
  let cursor = 0;
  for (const match of content.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ type: "markdown", content: content.slice(cursor, index) });
    try {
      parts.push({ type: "artifact", artifact: validateStudyArtifact(JSON.parse(match[1]!)) });
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

export function normalizeArtifactFences(content: string): string {
  return content.replace(/```json\s*\n([\s\S]*?)```/gi, (block, body: string) => {
    try {
      const parsed = JSON.parse(body) as { artifact?: unknown };
      return parsed?.artifact === "flowchart" || parsed?.artifact === "hierarchy" || parsed?.artifact === "comparison" || parsed?.artifact === "er-diagram"
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

  if (item.artifact === "comparison") {
    if (!Array.isArray(item.columns) || !Array.isArray(item.rows) || item.rows.length > maxRows) {
      throw new Error("Invalid or oversized comparison table.");
    }
    const columns = item.columns.map((column) => text(column));
    if (columns.length < 2 || columns.length > 8) throw new Error("Comparison needs 2-8 columns.");
    const rows = item.rows.map((row) => {
      if (!Array.isArray(row) || row.length !== columns.length) throw new Error("Comparison row width is invalid.");
      return row.map((cell) => text(cell));
    });
    return { artifact: "comparison", version: 1, title, columns, rows };
  }

  if (item.artifact === "er-diagram") {
    if (!Array.isArray(item.entities) || !Array.isArray(item.relationships) || item.entities.length > 20) {
      throw new Error("Invalid or oversized ER diagram.");
    }
    const entities = item.entities.map((entity) => {
      const record = object(entity);
      if (!Array.isArray(record.attributes) || record.attributes.length > 20) throw new Error("Invalid ER entity attributes.");
      return {
        id: text(record.id),
        name: text(record.name),
        attributes: record.attributes.map((attribute) => {
          const value = object(attribute);
          return { name: text(value.name), ...(value.key === true ? { key: true } : {}) };
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
