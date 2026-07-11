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
      {artifact.artifact === "er-diagram" ? <ErDiagram artifact={artifact} /> : null}
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
  return <ul className="ml-2 border-l-2 border-primary/20 pl-4 text-sm"><li className="py-1"><span className="inline-block rounded-lg border border-primary/15 bg-primary/5 px-3 py-2 font-medium">{node.label}</span>{node.children?.map((child, index) => <Hierarchy key={`${child.label}-${index}`} node={child} />)}</li></ul>;
}

function ErDiagram({ artifact }: { artifact: Extract<StudyArtifact, { artifact: "er-diagram" }> }) {
  const entities = new Map(artifact.entities.map((entity) => [entity.id, entity]));
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {artifact.entities.map((entity) => <div key={entity.id} className="overflow-hidden rounded-xl border-2 border-primary/25 bg-background shadow-sm">
        <div className="border-b border-primary/20 bg-primary/10 px-3 py-2 text-center text-sm font-bold">{entity.name}</div>
        <ul className="divide-y divide-border/60 text-xs">{entity.attributes.map((attribute, index) => <li key={`${attribute.name}-${index}`} className="flex items-center gap-2 px-3 py-1.5"><span className={attribute.key ? "font-semibold underline decoration-primary decoration-2" : ""}>{attribute.name}</span>{attribute.key ? <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">KEY</span> : null}</li>)}</ul>
      </div>)}
    </div>
    <div className="space-y-2">
      {artifact.relationships.map((relationship, index) => <div key={`${relationship.from}-${relationship.to}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-xs">
        <span className="rounded-lg border bg-background px-2 py-1.5 text-right font-medium">{entities.get(relationship.from)?.name} <span className="text-muted-foreground">{relationship.fromCardinality}</span></span>
        <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-center font-semibold">{relationship.label}</span>
        <span className="rounded-lg border bg-background px-2 py-1.5 font-medium"><span className="text-muted-foreground">{relationship.toCardinality}</span> {entities.get(relationship.to)?.name}</span>
      </div>)}
    </div>
  </div>;
}
