import type {
  ApprovalDecision,
  DesignItemStatus,
  DesignItemType,
  EvidenceType,
  InterfaceStatus,
  InterfaceType,
  IssueSeverity,
  IssueStatus,
  RiskStatus,
  StakeholderNeedStatus,
  VerificationMethod,
  VerificationStatus,
} from "./shared/enums";
import type { ApprovalSubject, EvidenceSubject } from "./links";

/**
 * Domain representations of the artifacts that do not yet have an application
 * service. Types only, deliberately: create/update validation schemas live
 * next to the repository that needs them (see project/requirement/
 * engineering-decision/change-request), so we don't ship validation for
 * operations nothing performs yet.
 */

/** An originating need or problem statement. Requirements derive from these. */
export interface StakeholderNeed {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  stakeholder: string;
  status: StakeholderNeedStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** A system, subsystem, assembly, component, or software element. */
export interface DesignItem {
  id: string;
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  itemType: DesignItemType;
  status: DesignItemStatus;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** An engineering interface between system elements. */
export interface InterfaceDefinition {
  id: string;
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  interfaceType: InterfaceType;
  status: InterfaceStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** A planned or executed verification activity. */
export interface VerificationActivity {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string | null;
  method: VerificationMethod;
  status: VerificationStatus;
  ownerId: string | null;
  plannedDate: Date | null;
  completedDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** An engineering risk. */
export interface Risk {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  cause: string | null;
  consequence: string | null;
  status: RiskStatus;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** An observed problem or unresolved engineering question. */
export interface Issue {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Supporting engineering evidence. `sourceReference` is an external locator. */
export interface Evidence {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  evidenceType: EvidenceType;
  sourceReference: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A recorded approval action against exactly one subject.
 *
 * Persistence keeps a real foreign key per approvable type; the domain sees
 * the tagged `subject` pair instead, so callers never juggle six nullable ids.
 */
export interface Approval {
  id: string;
  projectId: string;
  approverId: string;
  decision: ApprovalDecision;
  comment: string | null;
  subject: ApprovalSubject;
  decidedAt: Date;
  createdAt: Date;
}

/** Evidence attached to exactly one supported artifact. */
export interface EvidenceAttachment {
  id: string;
  evidenceId: string;
  subject: EvidenceSubject;
  note: string | null;
  createdById: string | null;
  createdAt: Date;
}
