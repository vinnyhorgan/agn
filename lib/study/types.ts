export interface StudyChapterScope {
  deckId: string;
  slideStart: number;
  slideEnd: number;
}

export interface StudyChapter {
  id: string;
  title: string;
  description: string;
  goals: string[];
  scopes: StudyChapterScope[];
}

export interface StudyChapterPlan {
  version: 1;
  libraryKey: string;
  title: string;
  language: string;
  chapters: StudyChapter[];
}

export interface StudyPage {
  version: 1;
  chapterId: string;
  generatedAt: number;
  markdown: string;
  sourceChunkIds: string[];
}

export type StudyArtifact =
  | {
      artifact: "flowchart";
      version: 1;
      title: string;
      nodes: Array<{ id: string; label: string }>;
      edges: Array<{ from: string; to: string; label?: string }>;
    }
  | {
      artifact: "hierarchy";
      version: 1;
      title: string;
      root: StudyHierarchyNode;
    }
  | {
      artifact: "comparison";
      version: 1;
      title: string;
      columns: string[];
      rows: string[][];
    }
  | {
      artifact: "er-diagram";
      version: 1;
      title: string;
      entities: Array<{
        id: string;
        name: string;
        attributes: Array<{ name: string; key?: boolean }>;
      }>;
      relationships: Array<{
        from: string;
        to: string;
        label: string;
        fromCardinality?: string;
        toCardinality?: string;
      }>;
    };

export interface StudyHierarchyNode {
  label: string;
  children?: StudyHierarchyNode[];
}
