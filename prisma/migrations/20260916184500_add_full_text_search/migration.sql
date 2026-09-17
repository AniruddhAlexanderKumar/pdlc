-- Full-text and identifier search across every searchable artifact.
--
-- Expression indexes rather than stored tsvector columns. The expression is
-- evaluated from the row itself, so there is no second copy of the text to
-- fall out of step with the record it describes, no trigger to maintain,
-- and nothing new for prisma/schema.prisma to have to model -- which keeps
-- `prisma migrate diff` clean without teaching Prisma about a column type
-- it does not own.
--
-- The exact expressions below are emitted by `searchIndexStatements()` in
-- src/server/repositories/search.repository.ts, and the search query builds
-- the identical expression from the same function. If the two ever diverge,
-- PostgreSQL silently stops using these indexes and every search degrades
-- to a sequential scan over eighteen tables -- a performance collapse with
-- no error to notice. search.repository.test.ts therefore re-derives the
-- statements and asserts this file still contains each one verbatim.
--
-- pg_trgm backs partial identifier matching, so REQ-01 finds REQ-001.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "stakeholder_needs_search_idx" ON "stakeholder_needs" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "stakeholder_needs_identifier_trgm_idx" ON "stakeholder_needs" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "requirements_search_idx" ON "requirements" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("statement", '')), 'C') || setweight(to_tsvector('english', coalesce("rationale", '')), 'C')));
CREATE INDEX IF NOT EXISTS "requirements_identifier_trgm_idx" ON "requirements" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "engineering_decisions_search_idx" ON "engineering_decisions" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("statement", '')), 'C') || setweight(to_tsvector('english', coalesce("rationale", '')), 'C')));
CREATE INDEX IF NOT EXISTS "engineering_decisions_identifier_trgm_idx" ON "engineering_decisions" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "design_items_search_idx" ON "design_items" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("name", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "design_items_identifier_trgm_idx" ON "design_items" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "interface_definitions_search_idx" ON "interface_definitions" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("name", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "interface_definitions_identifier_trgm_idx" ON "interface_definitions" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "verification_activities_search_idx" ON "verification_activities" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "verification_activities_identifier_trgm_idx" ON "verification_activities" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "risks_search_idx" ON "risks" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "risks_identifier_trgm_idx" ON "risks" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "issues_search_idx" ON "issues" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "issues_identifier_trgm_idx" ON "issues" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "change_requests_search_idx" ON "change_requests" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "change_requests_identifier_trgm_idx" ON "change_requests" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "evidence_search_idx" ON "evidence" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "evidence_identifier_trgm_idx" ON "evidence" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "suppliers_search_idx" ON "suppliers" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("name", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "suppliers_identifier_trgm_idx" ON "suppliers" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "supplied_items_search_idx" ON "supplied_items" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("name", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "supplied_items_identifier_trgm_idx" ON "supplied_items" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "engineering_baselines_search_idx" ON "engineering_baselines" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("name", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "engineering_baselines_identifier_trgm_idx" ON "engineering_baselines" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "operational_observations_search_idx" ON "operational_observations" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "operational_observations_identifier_trgm_idx" ON "operational_observations" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "certification_programs_search_idx" ON "certification_programs" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("name", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "certification_programs_identifier_trgm_idx" ON "certification_programs" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "certification_bases_search_idx" ON "certification_bases" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "certification_bases_identifier_trgm_idx" ON "certification_bases" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "compliance_items_search_idx" ON "compliance_items" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "compliance_items_identifier_trgm_idx" ON "compliance_items" USING GIN ("identifier" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "certification_findings_search_idx" ON "certification_findings" USING GIN ((setweight(to_tsvector('simple', coalesce("identifier", '')), 'A') || setweight(to_tsvector('english', coalesce("title", '')), 'B') || setweight(to_tsvector('english', coalesce("description", '')), 'C')));
CREATE INDEX IF NOT EXISTS "certification_findings_identifier_trgm_idx" ON "certification_findings" USING GIN ("identifier" gin_trgm_ops);
