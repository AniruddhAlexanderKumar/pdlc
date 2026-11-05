/** Versioned, editable source for the initial conceptual diagram editor. */
export type DiagramNode = { id: string; label: string; x: number; y: number };
export type DiagramEdge = { id: string; from: string; to: string; label: string };
export type DiagramSource = { schemaVersion: 1; nodes: DiagramNode[]; edges: DiagramEdge[] };
export type DesignDocument = {
  id: string; title: string; kind: 'diagram'; ownerId: string | null; ownerName: string | null;
  projectId: string | null; productId: string | null; headRevision: number;
  createdAt: string; updatedAt: string; canEdit: boolean;
};
export type DesignDetail = { document: DesignDocument; source: DiagramSource };
export type DesignRevision = { revision: number; summary: string; authorName: string | null; createdAt: string };
