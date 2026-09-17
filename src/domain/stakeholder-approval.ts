import { z } from "zod";

export const stakeholderApprovalStateSchema = z.enum([
  "DRAFT",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "CHANGES_REQUESTED",
]);

export type StakeholderApprovalState = z.infer<typeof stakeholderApprovalStateSchema>;

export const stakeholderPositionSchema = z.enum([
  "AGREE",
  "DISAGREE",
  "CHANGES_REQUESTED",
  "PENDING_REVIEW",
]);

export type StakeholderPosition = z.infer<typeof stakeholderPositionSchema>;

export interface StakeholderReviewRecord {
  id: string;
  requirementId: string;
  stakeholderId: string;
  stakeholderName: string;
  position: StakeholderPosition;
  notes?: string;
  reviewedAt?: Date;
}

export interface RequirementApprovalSummary {
  requirementId: string;
  approvalState: StakeholderApprovalState;
  requiredStakeholdersCount: number;
  approvedCount: number;
  disagreedCount: number;
  pendingCount: number;
  reviews: StakeholderReviewRecord[];
  isUsedInEngineeringWorkUnapproved: boolean;
  hasChangedAfterApproval: boolean;
}
