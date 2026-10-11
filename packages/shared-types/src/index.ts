// NexGen PLM - Shared Domain Types

export type UserRole = 
  | 'OrgAdmin'
  | 'ProjectAdmin'
  | 'SystemsEngineer'
  | 'RequirementsEngineer'
  | 'DesignEngineer'
  | 'VerificationEngineer'
  | 'QualityEngineer'
  | 'SafetyEngineer'
  | 'ConfigurationManager'
  | 'Approver'
  | 'ReadOnly';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  title?: string;
  organizationId: string;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  code: string;
  createdAt: string;
}

export type ProjectPhase = 
  | 'Opportunity'
  | 'Concept Development'
  | 'Feasibility & Requirements'
  | 'System Requirements Review (SRR)'
  | 'Preliminary Architecture'
  | 'Preliminary Design Review (PDR)'
  | 'Detailed Design'
  | 'Critical Design Review (CDR)'
  | 'Implementation & Integration'
  | 'Verification'
  | 'Validation & Qualification'
  | 'Operational Readiness'
  | 'Release'
  | 'In-Service Engineering'
  | 'Retirement';

export interface Project {
  id: string;
  name: string;
  description?: string;
  phase: ProjectPhase;
  status: 'Active' | 'On Hold' | 'Completed' | 'Archived';
  ownerId: string;
  organizationId: string;
  targetReleaseDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  projectId?: string;
  title: string;
  problem: string;
  justification?: string;
  status: 'Draft' | 'In Review' | 'Approved' | 'Converted' | 'Rejected';
  targetDeliveryDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type RequirementType = 
  | 'Physical'
  | 'Performance'
  | 'Safety'
  | 'Interface'
  | 'Functional'
  | 'Environmental'
  | 'Reliability'
  | 'Regulatory';

export type RequirementStatus = 
  | 'Draft'
  | 'In Review'
  | 'Approved'
  | 'Baselined'
  | 'Superseded'
  | 'Rejected';

export type VerificationMethod = 
  | 'Test'
  | 'Inspection'
  | 'Analysis'
  | 'Demonstration';

export interface Requirement {
  id: string;
  projectId: string;
  title?: string;
  text: string;
  rationale?: string;
  type: RequirementType;
  status: RequirementStatus;
  allocatedTo?: string | null; // Architecture element ID
  verificationMethod: VerificationMethod;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  revision: number;
  parentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementQualityCheck {
  ruleId: string;
  severity: 'Warning' | 'Error';
  message: string;
  field?: string;
}

export type ArchitectureElementType = 
  | 'System'
  | 'Subsystem'
  | 'Assembly'
  | 'Component'
  | 'Electronic Hardware'
  | 'Software'
  | 'Interface';

export interface ArchitectureElement {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  type: ArchitectureElementType;
  parentId?: string | null;
  revision: number;
  status: 'Draft' | 'Approved' | 'Baselined' | 'Superseded';
  createdAt: string;
  updatedAt: string;
}

export type VerificationStatus = 
  | 'Planned'
  | 'Ready'
  | 'In Progress'
  | 'Passed'
  | 'Failed'
  | 'Blocked';

export interface VerificationProcedure {
  id: string;
  projectId: string;
  name: string;
  method: VerificationMethod;
  reqId: string;
  archId?: string | null;
  acceptanceCriteria: string;
  status: VerificationStatus;
  resultSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationMeasurement {
  parameter: string;
  expected: string;
  actual: string;
  unit: string;
  tolerance?: string;
  pass: boolean;
}

export interface VerificationExecution {
  id: string;
  procedureId: string;
  executionNumber: number;
  testConfiguration: string;
  executorId: string;
  witness?: string;
  outcome: 'Passed' | 'Failed' | 'Inconclusive';
  measurements: VerificationMeasurement[];
  observations: string;
  deviations?: string;
  evidenceNotes?: string;
  executedAt: string;
}

export type RiskSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type RiskLikelihood = 'Rare' | 'Unlikely' | 'Possible' | 'Likely' | 'Almost Certain';
export type RiskStatus = 'Open' | 'Mitigated' | 'Accepted' | 'Closed';

export interface Risk {
  id: string;
  projectId: string;
  title: string;
  cause?: string;
  consequence?: string;
  severity: RiskSeverity;
  likelihood: RiskLikelihood;
  ratingScore: number;
  linkedReq?: string | null;
  linkedSys?: string | null;
  status: RiskStatus;
  mitigation?: string;
  mitigationOwner?: string;
  residualRisk?: RiskSeverity;
  createdAt: string;
  updatedAt: string;
}

export type NonconformanceStatus = 
  | 'Investigation'
  | 'Disposition Review'
  | 'Corrective Action'
  | 'Effectiveness Verification'
  | 'Closed';

export interface Nonconformance {
  id: string;
  projectId: string;
  title: string;
  description: string;
  severity: 'Minor' | 'Major' | 'Critical';
  linkedVrf?: string | null;
  linkedReq?: string | null;
  status: NonconformanceStatus;
  containmentActions?: string;
  rootCause?: string;
  proposedDisposition?: 'Rework' | 'Repair' | 'Use As Is' | 'Scrap' | 'Return to Vendor';
  correctiveAction?: string;
  closureEvidence?: string;
  reportedBy: string;
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export type ECRStatus = 
  | 'Draft'
  | 'Submitted'
  | 'Impact Analysis'
  | 'Technical Review'
  | 'Approved'
  | 'Rejected'
  | 'Implemented'
  | 'Closed';

export interface ChangeImpactItem {
  id: string;
  objectType: 'Requirement' | 'Architecture' | 'Verification' | 'Risk' | 'Document';
  objectId: string;
  title: string;
  impactType: 'Direct Target' | 'Allocation Affected' | 'Invalidates Verification' | 'Re-opens Risk' | 'Parent Impact';
  reason: string;
  requiresRetest?: boolean;
}

export interface EngineeringChangeRequest {
  id: string;
  projectId: string;
  title: string;
  reason: string;
  proposedModification: string;
  targetReqId?: string | null;
  targetSysId?: string | null;
  originatorId: string;
  status: ECRStatus;
  severity: 'Class I (Major)' | 'Class II (Minor)';
  costImpact?: string;
  scheduleImpact?: string;
  impacts?: ChangeImpactItem[];
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringChangeOrder {
  id: string;
  ecrId: string;
  projectId: string;
  title: string;
  authorizedScope: string;
  implementationInstructions: string;
  status: 'In Progress' | 'Verified' | 'Closed';
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Baseline {
  id: string;
  projectId: string;
  name: string;
  type: 'Functional' | 'Allocated' | 'Product' | 'Release';
  description?: string;
  snapshotData: {
    requirements: Requirement[];
    architecture: ArchitectureElement[];
    verification: VerificationProcedure[];
    risks: Risk[];
  };
  createdBy: string;
  createdAt: string;
}

export interface ReleaseGateCriteria {
  id: string;
  name: string;
  status: 'Met' | 'Blocked' | 'Waived';
  details: string;
  isMandatory: boolean;
}

export interface ReleaseEvaluation {
  isReady: boolean;
  blockersCount: number;
  criteria: ReleaseGateCriteria[];
}

export interface ReleaseRecord {
  id: string;
  projectId: string;
  version: string;
  name: string;
  status: 'Draft' | 'Approved' | 'Released';
  baselineId?: string;
  releaseNotes?: string;
  releasedBy?: string;
  releasedAt?: string;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  projectId: string;
  title: string;
  type: 'Specification' | 'Drawing' | 'Test Report' | 'CAD Model' | 'ICD' | 'Manual';
  revision: string;
  status: 'Draft' | 'In Review' | 'Approved' | 'Obsolete';
  fileName?: string;
  fileSize?: number;
  checksum?: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogItem {
  id: string;
  actorEmail: string;
  action: string;
  objectType: string;
  objectId: string;
  details?: string;
  timestamp: string;
}

export interface DashboardTelemetry {
  project: Project;
  totalReqs: number;
  allocatedReqs: number;
  baselinedReqs: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  highRisks: number;
  openNCs: number;
  openECRs: number;
  isReleaseReady: boolean;
  blockers: string[];
}
