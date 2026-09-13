-- ---------------------------------------------------------------------------
-- Concurrency guards: enforce "at most one ACTIVE row per parent" at the
-- database level for the two places that invariant exists outside Sentinel
-- (which already has its own partial unique index — see
-- 20260910000000_add_decision_sentinel/migration.sql).
--
-- Both activateBaseline and activateBasis today read the current ACTIVE row,
-- decide whether to supersede it, and then write — a read/decide/write
-- sequence that a service-level check cannot make race-safe on its own, since
-- two concurrent activations can both read "no ACTIVE row" (or the same one)
-- before either commits. A partial unique index cannot be expressed in
-- schema.prisma, so — exactly as for surveillance_targets — it is
-- hand-written here. The service layer does not change its writes to an
-- upsert for these: it already does read-then-write inside a transaction, so
-- the index's job is simply to make a losing concurrent transaction fail
-- with a unique-constraint violation (translated to a ConflictError via
-- rethrowAsConflict) instead of silently succeeding alongside the winner.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "engineering_baselines_active_unique"
ON "engineering_baselines" ("projectId")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "certification_bases_active_unique"
ON "certification_bases" ("certificationProgramId")
WHERE "status" = 'ACTIVE';
