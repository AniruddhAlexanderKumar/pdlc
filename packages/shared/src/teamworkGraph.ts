/** Graph records are projections of the existing workspace models, not copies of them. */
export type GraphNodeType = 'workspace' | 'member' | 'project' | 'issue' | 'product' | 'task';
export type GraphRelationType = 'contains' | 'member_of' | 'assigned_to' | 'depends_on' | 'relates_to';
export interface GraphNode {
  id: string; recordId: string; type: GraphNodeType; title: string; key?: string;
  description?: string; status?: string; priority?: string; ownerId?: string | null;
  projectId?: string; url: string; createdAt?: string; updatedAt?: string;
}
export interface GraphEdge {
  id: string; source: string; target: string; type: GraphRelationType;
  description?: string; createdAt?: string; createdBy?: string | null; editable: boolean;
}
export interface TeamworkGraph { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean; generatedAt: string }
export interface GraphRelationshipInput { sourceId: string; targetId: string; type: 'depends_on' | 'relates_to'; description: string }

/** Impact follows the reverse of "depends on": a prerequisite may affect its dependents. */
export function impactIds(start: string, edges: GraphEdge[], maxDepth = 3): Set<string> {
  const seen = new Set([start]); let frontier = [start];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const edge of edges) if (edge.type === 'depends_on' && frontier.includes(edge.target) && !seen.has(edge.source)) {
      seen.add(edge.source); next.push(edge.source);
    }
    frontier = next;
  }
  return seen;
}

export function connectedIds(start: string, edges: GraphEdge[], maxDepth: number): Set<string> {
  const seen = new Set([start]); let frontier = [start];
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const edge of edges) {
      const neighbor = frontier.includes(edge.source) ? edge.target : frontier.includes(edge.target) ? edge.source : null;
      if (neighbor && !seen.has(neighbor)) { seen.add(neighbor); next.push(neighbor); }
    }
    frontier = next;
  }
  return seen;
}

export interface GraphFinding {
  id: string; projectId: string; key: string; title: string; status: string;
  priority: string; reason: string; url: string;
  supporting?: { id: string; key: string; title: string; url: string };
}
export interface GraphAnswer {
  intent: string; explanation: string; findings: GraphFinding[]; truncated: boolean;
}
