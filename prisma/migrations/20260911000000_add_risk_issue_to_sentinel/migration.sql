-- Decision Sentinel: widen source-type coverage to Risk and Issue.
--
-- Additive only. Risk and Issue already exist as tables — this migration
-- touches nothing about them. The single change is widening the
-- `SurveillanceSourceType` enum the Decision Sentinel already uses, so a
-- change to a risk or an issue can be recorded as a `SentinelEvent` the same
-- way a change to a requirement or design item already is. No existing
-- table, column, index, constraint, or enum value is altered or dropped.

-- AlterEnum
ALTER TYPE "SurveillanceSourceType" ADD VALUE 'RISK';
ALTER TYPE "SurveillanceSourceType" ADD VALUE 'ISSUE';
