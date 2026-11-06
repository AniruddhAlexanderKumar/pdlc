import { z } from 'zod';
import { shortText, uuid } from '../lib/http.js';

const node = z.object({ id: uuid, label: shortText(120).min(1), x: z.number().finite().min(0).max(1760), y: z.number().finite().min(0).max(1120) }).strict();
const edge = z.object({ id: uuid, from: uuid, to: uuid, label: shortText(80) }).strict();
export const diagramSourceSchema = z.object({ schemaVersion: z.literal(1), nodes: z.array(node).max(100), edges: z.array(edge).max(200) }).strict().superRefine((source, ctx) => {
  const ids = new Set<string>();
  for (const n of source.nodes) { if (ids.has(n.id)) ctx.addIssue({ code:'custom', message:'Duplicate node ID' }); ids.add(n.id); }
  const edges = new Set<string>();
  for (const e of source.edges) {
    if (edges.has(e.id)) ctx.addIssue({ code:'custom', message:'Duplicate connector ID' }); edges.add(e.id);
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) ctx.addIssue({ code:'custom', message:'Each connector must join two existing, distinct nodes' });
  }
});
