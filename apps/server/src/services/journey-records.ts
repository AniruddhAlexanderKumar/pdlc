import { sql } from 'kysely';
import { db } from '../db/index.js';

export async function listJourneyRecords(projectId: string) {
  const result = await sql`
    SELECT r.id, r.activity_id AS "activityId", r.kind, r.label,
      CASE WHEN r.kind = 'release' THEN jsonb_build_object('records', r.data->'records', 'designs',
        (SELECT COALESCE(jsonb_agg(d - 'source'), '[]') FROM jsonb_array_elements(r.data->'designs') d)) ELSE r.data END AS data,
      r.created_at AS "createdAt",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'filename', v.filename)
        ORDER BY v.sequence DESC)
        FROM journey_file_versions v WHERE v.record_id = r.id), '[]') AS versions
    FROM journey_records r WHERE r.project_id = ${projectId}::uuid
    ORDER BY r.created_at, r.id
  `.execute(db);
  return result.rows;
}

export async function listJourneyDesigns(projectId: string, workspaceId: string) {
  const result = await sql<{id: string; kind: 'diagram' | 'sketch' | 'model'; label: string; revision: number}>`
    SELECT id, kind, title AS label, head_revision AS revision
      FROM design_documents WHERE project_id=${projectId}::uuid AND workspace_id=${workspaceId}::uuid
    UNION ALL
    SELECT id, 'sketch', name, head_revision
      FROM cad_documents WHERE project_id=${projectId}::uuid AND workspace_id=${workspaceId}::uuid AND archived_at IS NULL
    ORDER BY label, id
  `.execute(db);
  return result.rows;
}

/** A single statement sees a consistent set of design heads, file versions and records. */
export async function journeyReleaseContents(projectId: string, workspaceId: string, executor: typeof db = db) {
  const result = await sql<{ snapshot: { records: unknown[]; designs: {source: unknown; id: string; kind: string; label: string; revision: number}[] } }>`
    SELECT jsonb_build_object(
      'records', COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', r.id, 'kind', r.kind, 'label', r.label, 'data', r.data,
          'version', (SELECT jsonb_build_object('id', v.id, 'filename', v.filename)
            FROM journey_file_versions v WHERE v.record_id=r.id ORDER BY v.sequence DESC LIMIT 1))
          ORDER BY r.created_at, r.id)
        FROM journey_records r WHERE r.project_id=${projectId}::uuid AND r.kind IN ('part','test','file')
      ), '[]'),
      'designs', COALESCE((
        SELECT jsonb_agg(to_jsonb(d) ORDER BY d.label, d.id) FROM (
          SELECT doc.id, doc.kind, doc.title AS label, rev.revision, rev.source
          FROM design_documents doc JOIN design_revisions rev ON rev.document_id=doc.id AND rev.revision=doc.head_revision
          WHERE doc.project_id=${projectId}::uuid AND doc.workspace_id=${workspaceId}::uuid
          UNION ALL
          SELECT doc.id, 'sketch', doc.name, rev.revision, rev.source
          FROM cad_documents doc JOIN cad_document_revisions rev ON rev.document_id=doc.id AND rev.revision=doc.head_revision
          WHERE doc.project_id=${projectId}::uuid AND doc.workspace_id=${workspaceId}::uuid AND doc.archived_at IS NULL
        ) d
      ), '[]')
    ) AS snapshot
  `.execute(executor);
  return result.rows[0].snapshot;
}
