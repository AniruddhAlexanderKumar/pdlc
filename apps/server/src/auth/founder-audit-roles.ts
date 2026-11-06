import { sql, type Kysely } from 'kysely';
import type { Database } from '../db/schema.js';

/**
 * Privileged, explicit provisioning primitive. Not called by startup or HTTP.
 * The caller must supply already-created, independently administered roles and
 * review all database grants. DB owners/superusers remain outside this boundary.
 */
export async function provisionFounderAuditRoles(database: Kysely<Database>, roles: { owner: string; writer: string; reader: string; app: string }): Promise<void> {
  const names = [roles.owner, roles.writer, roles.reader, roles.app];
  if (new Set(names).size !== 4 || names.some((n) => !/^[a-z_][a-z0-9_]{0,62}$/.test(n))) throw new Error('Invalid audit role configuration');
  await database.transaction().execute(async (trx) => {
    const found = await sql<{ rolname: string; rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean; rolreplication: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>`
      SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin
      FROM pg_roles WHERE rolname = ANY(${names}::text[])
    `.execute(trx);
    if (found.rows.length !== 4 || found.rows.some((r) => r.rolsuper || r.rolcreaterole || r.rolcreatedb || r.rolreplication || r.rolbypassrls || (r.rolname !== roles.app && r.rolcanlogin))) throw new Error('Audit roles are missing or privileged');
    // No runtime, writer or reader identity may inherit an administrative role,
    // own the DB/schema, or have CREATE on the audit schema.
    const unsafe = await sql<{ unsafe: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM unnest(${[roles.app, roles.writer, roles.reader]}::text[]) AS subject(name)
        CROSS JOIN pg_roles privileged
        WHERE (privileged.rolsuper OR privileged.rolcreaterole OR privileged.rolcreatedb OR privileged.rolreplication OR privileged.rolbypassrls
          OR privileged.oid = (SELECT datdba FROM pg_database WHERE datname = current_database())
          OR privileged.oid = (SELECT nspowner FROM pg_namespace WHERE nspname = 'public'))
          AND pg_has_role(subject.name, privileged.oid, 'MEMBER')
      ) OR EXISTS (
        SELECT 1 FROM unnest(${[roles.app, roles.writer, roles.reader]}::text[]) AS subject(name)
        WHERE has_schema_privilege(subject.name, 'public', 'CREATE')
      ) OR EXISTS (
        SELECT 1 FROM unnest(${[roles.app, roles.writer, roles.reader]}::text[]) AS subject(name)
        CROSS JOIN pg_auth_members membership
        WHERE membership.admin_option AND pg_has_role(subject.name, membership.member, 'MEMBER')
      ) OR pg_has_role(${roles.app}, ${roles.owner}, 'MEMBER')
        OR pg_has_role(${roles.app}, ${roles.reader}, 'MEMBER')
        OR pg_has_role(${roles.writer}, ${roles.owner}, 'MEMBER')
        OR pg_has_role(${roles.writer}, ${roles.reader}, 'MEMBER')
        OR pg_has_role(${roles.reader}, ${roles.owner}, 'MEMBER')
        OR pg_has_role(${roles.reader}, ${roles.writer}, 'MEMBER') AS unsafe
    `.execute(trx);
    if (unsafe.rows[0]?.unsafe) throw new Error('Unsafe inherited audit privileges');
    // Refuse to silently remove grants from unrelated principals or columns.
    const acl = await sql<{ unsafe: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
        LEFT JOIN pg_roles r ON r.oid = a.grantee
        WHERE c.oid = 'public.founder_security_audit'::regclass
          AND a.grantee <> c.relowner AND a.grantee <> 0 AND NOT (r.rolname = ANY(${names}::text[]))
      ) OR EXISTS (
        SELECT 1 FROM pg_attribute WHERE attrelid = 'public.founder_security_audit'::regclass AND attacl IS NOT NULL
      ) AS unsafe
    `.execute(trx);
    if (acl.rows[0]?.unsafe) throw new Error('Unexpected existing audit grants require independent review');
    await sql`ALTER TABLE public.founder_security_audit OWNER TO ${sql.id(roles.owner)}`.execute(trx);
    await sql`REVOKE ALL ON TABLE public.founder_security_audit FROM PUBLIC, ${sql.id(roles.app)}, ${sql.id(roles.writer)}, ${sql.id(roles.reader)}`.execute(trx);
    await sql`GRANT INSERT (event_type, actor_id, actor_role, target_id, outcome, request_id) ON public.founder_security_audit TO ${sql.id(roles.writer)}`.execute(trx);
    await sql`GRANT SELECT ON public.founder_security_audit TO ${sql.id(roles.reader)}`.execute(trx);
    await sql`GRANT ${sql.id(roles.writer)} TO ${sql.id(roles.app)}`.execute(trx);
    // Check effective AND SET ROLE reachable rights, including PostgreSQL's
    // built-in broad-data roles and column-level grant options. Roll back on drift.
    const effective = await sql<{ unsafe: boolean }>`
      SELECT EXISTS (
        SELECT 1 FROM unnest(${[roles.app, roles.writer, roles.reader]}::text[]) AS subject(name)
        CROSS JOIN pg_roles reachable
        WHERE pg_has_role(subject.name, reachable.oid, 'SET') AND (
          has_schema_privilege(reachable.oid, 'public', 'CREATE')
          OR has_table_privilege(reachable.oid, 'public.founder_security_audit', 'UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES')
          OR has_any_column_privilege(reachable.oid, 'public.founder_security_audit', 'UPDATE, REFERENCES, INSERT WITH GRANT OPTION, SELECT WITH GRANT OPTION')
          OR (subject.name <> ${roles.reader} AND has_any_column_privilege(reachable.oid, 'public.founder_security_audit', 'SELECT'))
          OR (subject.name = ${roles.reader} AND has_any_column_privilege(reachable.oid, 'public.founder_security_audit', 'INSERT'))
          OR has_column_privilege(reachable.oid, 'public.founder_security_audit', 'id', 'INSERT')
          OR has_column_privilege(reachable.oid, 'public.founder_security_audit', 'created_at', 'INSERT')
        )
      ) AS unsafe
    `.execute(trx);
    if (effective.rows[0]?.unsafe) throw new Error('Effective audit rights exceed the role model');
  });
}
