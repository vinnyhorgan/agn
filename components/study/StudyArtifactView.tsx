import type { StudyArtifact, StudyHierarchyNode } from "@/lib/study/types";

export function StudyArtifactView({ artifact }: { artifact: StudyArtifact }) {
  return (
    <figure className="my-5 overflow-x-auto rounded-2xl border border-border bg-card p-4">
      <figcaption className="mb-4 text-sm font-semibold text-foreground">{artifact.title}</figcaption>
      {artifact.artifact === "flowchart" ? <Flowchart artifact={artifact} /> : null}
      {artifact.artifact === "hierarchy" ? <Hierarchy node={artifact.root} /> : null}
      {artifact.artifact === "comparison" ? (
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead><tr>{artifact.columns.map((column) => <th key={column} className="border-b border-border p-2 font-semibold">{column}</th>)}</tr></thead>
          <tbody>{artifact.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index} className="border-b border-border/60 p-2 align-top">{cell}</td>)}</tr>)}</tbody>
        </table>
      ) : null}
    </figure>
  );
}

function Flowchart({ artifact }: { artifact: Extract<StudyArtifact, { artifact: "flowchart" }> }) {
  const labels = new Map(artifact.nodes.map((node) => [node.id, node.label]));
  return <ol className="space-y-2">{artifact.edges.map((edge, index) => (
    <li key={`${edge.from}-${edge.to}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
      <span className="rounded-lg border border-border bg-background p-2">{labels.get(edge.from)}</span>
      <span className="text-center text-xs text-muted-foreground"><span className="block">{edge.label}</span>→</span>
      <span className="rounded-lg border border-primary/25 bg-primary/5 p-2">{labels.get(edge.to)}</span>
    </li>
  ))}</ol>;
}

function Hierarchy({ node }: { node: StudyHierarchyNode }) {
  return <ul className="ml-3 border-l border-border pl-4 text-sm"><li><span className="inline-block rounded-lg bg-accent px-2.5 py-1.5 font-medium">{node.label}</span>{node.children?.map((child, index) => <Hierarchy key={`${child.label}-${index}`} node={child} />)}</li></ul>;
}
