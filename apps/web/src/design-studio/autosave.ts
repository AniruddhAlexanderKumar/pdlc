import type { DiagramSource } from '@sv/shared';

/** Check editable values before scheduling a revision. The server remains authoritative. */
export function diagramDraftProblem(source: DiagramSource): string | null {
  for (const node of source.nodes) {
    if (!node.label.trim()) return 'Give every box a label before saving.';
    if (node.label.trim().length > 120) return 'Box labels must be 120 characters or fewer.';
    if (!Number.isFinite(node.x) || node.x < 0 || node.x > 1760 || !Number.isFinite(node.y) || node.y < 0 || node.y > 1120) return 'Box coordinates must stay within the canvas.';
  }
  if (source.edges.some(edge => edge.label.trim().length > 80)) return 'Connector labels must be 80 characters or fewer.';
  return null;
}
