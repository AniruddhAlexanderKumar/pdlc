/** Versioned, editable source for the initial conceptual diagram editor. */
export type DiagramNode = { id: string; label: string; x: number; y: number };
export type DiagramEdge = { id: string; from: string; to: string; label: string };
export type DiagramSource = { schemaVersion: 1; nodes: DiagramNode[]; edges: DiagramEdge[] };
export type ModelSource = {
  schemaVersion: 1;
  profile: 'rectangle' | 'circle' | 'triangle';
  width: number;
  depth: number;
  height: number;
};
export type DesignKind = 'diagram' | 'model';
export type DesignDocument = {
  id: string; title: string; kind: DesignKind; ownerId: string | null; ownerName: string | null;
  projectId: string | null; productId: string | null;
  /** Journey activity this design was attached to from the Journey or the Assistant. */
  journeyActivityId?: string | null;
  headRevision: number;
  createdAt: string; updatedAt: string; canEdit: boolean;
};
export type DesignDetail<Source = DiagramSource> = { document: DesignDocument; source: Source };
export type DesignRevision = { revision: number; summary: string; authorName: string | null; createdAt: string };
