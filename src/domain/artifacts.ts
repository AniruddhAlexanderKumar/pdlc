import type {
  ApprovalDecision,
  DesignItemStatus,
  DesignItemType,
  EvidenceStatus,
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
import type { ApprovalSubject } from "./links";

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

/**
 * Supporting engineering evidence.
 *
 * `sourceReference` is an external locator (a document number, a URL, a test
 * report id) — this system records that evidence exists and what it claims,
 * never the file itself. There is no file/blob storage anywhere in this
 * schema, so nothing here establishes binary integrity; see
 * `src/server/services/evidence.service.ts` for what "integrity" means for a
 * record like this one. `identifier` and lifecycle fields graduated in
 * alongside `evidence.service.ts` — see `evidence.ts` for the lifecycle,
 * editability and link contracts built on this type.
 */
export interface Evidence {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string | null;
  evidenceType: EvidenceType;
  sourceReference: string;
  status: EvidenceStatus;
  /** Who recorded this evidence. Set once, at creation — never reassigned. */
  recordedById: string | null;
  validatedById: string | null;
  validatedAt: Date | null;
  /** The evidence record that replaced this one, where one has. */
  supersededById: string | null;
  supersededAt: Date | null;
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

