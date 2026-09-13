import type {
  CertificationReview,
  CertificationReviewBasis,
  CertificationReviewCategory,
  CertificationReviewFindingStatus,
  CertificationReviewStatus,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

const NEWEST_FIRST = [{ evaluatedAt: "desc" as const }, { id: "desc" as const }];

export interface CreateReviewInput {
  certificationProgramId: string;
  status: CertificationReviewStatus;
  reviewVersion: string;
  fingerprint: string;
  basis: CertificationReviewBasis;
  summary: string | null;
  evaluatedById: string | null;
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  informationalCount: number;
  unknownCount: number;
}

export async function createReview(
  data: CreateReviewInput,
  client: DbClient = prisma,
): Promise<CertificationReview> {
  const row = await client.certificationReview.create({
    data: { ...data, basis: data.basis as object },
  });
  return toReview(row);
}

export interface PersistReviewFindingInput {
  ruleId: string;
  category: CertificationReviewCategory;
  status: CertificationReviewFindingStatus;
  subjectType: string;
  subjectId: string;
  subjectIdentifier: string | null;
  subjectLabel: string;
  message: string;
  basis: string[];
  sequence: number;
}

export async function createReviewFindings(
  reviewId: string,
  findings: readonly PersistReviewFindingInput[],
  client: DbClient = prisma,
): Promise<void> {
  if (findings.length === 0) return;
  await client.certificationReviewFinding.createMany({
    data: findings.map((finding) => ({ ...finding, reviewId })),
  });
}

export async function findLatestReview(
  certificationProgramId: string,
  client: DbClient = prisma,
): Promise<CertificationReview | null> {
  const row = await client.certificationReview.findFirst({
    where: { certificationProgramId },
    orderBy: NEWEST_FIRST,
  });
  return row ? toReview(row) : null;
}

/**
 * Every review for a program, newest first.
 *
 * Bounded like every other project-wide history read in this codebase (see
 * `drift-assessment.repository.ts#listAssessments`): a review is a human- or
 * Sentinel-triggered evaluation, not a high-frequency write, so 200 is
 * generous headroom rather than a real ceiling on normal use — but without
 * it this was an unbounded scan of the program's entire review history on
 * every call.
 */
export async function listReviews(
  certificationProgramId: string,
  limit = 200,
  client: DbClient = prisma,
): Promise<CertificationReview[]> {
  const rows = await client.certificationReview.findMany({
    where: { certificationProgramId },
    orderBy: NEWEST_FIRST,
    take: limit,
  });
  return rows.map(toReview);
}

export async function findReviewInProgram(
  certificationProgramId: string,
  id: string,
  client: DbClient = prisma,
): Promise<CertificationReview | null> {
  const row = await client.certificationReview.findFirst({
    where: { id, certificationProgramId },
  });
  return row ? toReview(row) : null;
}

/** Reads a stored review's basis back out, exactly as recorded — never re-derived. */
export async function readReviewBasis(
  review: { id: string },
  client: DbClient = prisma,
): Promise<CertificationReviewBasis> {
  const row = await client.certificationReview.findUniqueOrThrow({
    where: { id: review.id },
    select: { basis: true },
  });
  return row.basis as unknown as CertificationReviewBasis;
}

export async function listFindings(reviewId: string, client: DbClient = prisma) {
  return client.certificationReviewFinding.findMany({
    where: { reviewId },
    orderBy: [{ sequence: "asc" }],
  });
}

type ReviewRow = {
  id: string;
  certificationProgramId: string;
  status: string;
  reviewVersion: string;
  fingerprint: string;
  summary: string | null;
  evaluatedAt: Date;
  evaluatedById: string | null;
  createdAt: Date;
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  informationalCount: number;
  unknownCount: number;
};

function toReview(row: ReviewRow): CertificationReview {
  return {
    id: row.id,
    certificationProgramId: row.certificationProgramId,
    status: row.status as CertificationReviewStatus,
    reviewVersion: row.reviewVersion,
    fingerprint: row.fingerprint,
    summary: row.summary,
    evaluatedAt: row.evaluatedAt,
    evaluatedById: row.evaluatedById,
    createdAt: row.createdAt,
    counts: {
      findingCount: row.findingCount,
      blockingCount: row.blockingCount,
      warningCount: row.warningCount,
      informationalCount: row.informationalCount,
      unknownCount: row.unknownCount,
    },
  };
}
