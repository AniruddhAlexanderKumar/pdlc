import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { IssuePriority, IssueStatus, IssueType, Role, StageId, TaskStatus } from '@sv/shared';

/** Kysely table types. Keep in sync with the SQL in ./migrations. */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type CreatedAt = ColumnType<Date, Date | string | undefined, never>;
/** numeric columns are parsed to JS numbers in db/index.ts */
type Numeric = ColumnType<number, number | string, number | string>;
/** numeric column with a database default */
type NumericDefault = ColumnType<number, number | string | undefined, number | string>;

export interface UsersTable {
  id: Generated<string>;
  email: string;
  name: string;
  password_hash: string;
  is_admin: Generated<boolean>;
  is_disabled: Generated<boolean>;
  failed_logins: Generated<number>;
  locked_until: Date | null;
  last_login_at: Date | null;
  /** DashboardSettings from @sv/shared; write with JSON.stringify. */
  dashboard_layout: ColumnType<unknown, string | null | undefined, string | null>;
  created_at: CreatedAt;
}

export interface WorkspacesTable {
  id: Generated<string>;
  name: string;
  currency: Generated<string>;
  created_at: CreatedAt;
}

export interface ProjectsTable {
  id: Generated<string>;
  workspace_id: string;
  project_key: string;
  name: string;
  description: Generated<string>;
  next_issue_number: Generated<number>;
  created_by: string | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface IssuesTable {
  id: Generated<string>;
  project_id: string;
  issue_number: number;
  type: IssueType;
  status: Generated<IssueStatus>;
  priority: Generated<IssuePriority>;
  summary: string;
  description: Generated<string>;
  labels: Generated<string[]>;
  reporter_id: string | null;
  assignee_id: string | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface MembershipsTable {
  workspace_id: string;
  user_id: string;
  role: Role;
  created_at: CreatedAt;
}

export interface SessionsTable {
  id: string; // sha256(token)
  user_id: string;
  workspace_id: string;
  created_at: CreatedAt;
  last_seen_at: Timestamp;
  expires_at: Timestamp;
  user_agent: string | null;
  ip: string | null;
}

export interface InvitesTable {
  id: Generated<string>;
  workspace_id: string;
  token_hash: string;
  role: Role;
  created_by: string;
  created_at: CreatedAt;
  expires_at: Timestamp;
  used_at: Date | null;
  used_by: string | null;
}

export interface PasswordResetsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  created_by: string | null;
  created_at: CreatedAt;
  expires_at: Timestamp;
  used_at: Date | null;
}

export interface SuppliersTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  website: Generated<string>;
  contact: Generated<string>;
  notes: Generated<string>;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface MaterialsTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  category: string;
  unit: string;
  unit_price: Numeric;
  description: Generated<string>;
  source_url: Generated<string>;
  notes: Generated<string>;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface MaterialQuotesTable {
  material_id: string;
  supplier_id: string;
  quoted_price: Numeric;
  moq: number | null;
}

export interface ProductsTable {
  id: Generated<string>;
  workspace_id: string;
  name: string;
  category: string;
  stage: StageId;
  image_url: Generated<string>;
  description: Generated<string>;
  notes: Generated<string>;
  target_price: Numeric | null;
  labour: NumericDefault;
  packaging: NumericDefault;
  overhead: NumericDefault;
  created_by: string | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface ProductMaterialsTable {
  product_id: string;
  material_id: string;
  quantity: Numeric;
  position: Generated<number>;
}

export interface TasksTable {
  id: Generated<string>;
  product_id: string;
  title: string;
  description: Generated<string>;
  status: TaskStatus;
  due_date: string | null;
  position: number;
  completed_at: Date | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface AnswersTable {
  product_id: string;
  question_key: string;
  value: ColumnType<unknown, string, string>;
  answered_by: string | null;
  answered_at: Timestamp;
}

export interface StageHistoryTable {
  id: Generated<string>;
  product_id: string;
  from_stage: string | null;
  to_stage: string;
  user_id: string | null;
  created_at: CreatedAt;
}

export interface XpEventsTable {
  id: Generated<string>;
  workspace_id: string;
  user_id: string;
  product_id: string | null;
  kind: string;
  ref: string;
  points: number;
  label: string;
  created_at: CreatedAt;
}

export interface AnalyticsEventsTable {
  id: Generated<string>;
  event_type: string;
  event_name: string;
  user_id: string | null;
  workspace_id: string | null;
  session_id: string | null;
  anonymous_id: string | null;
  page_path: string | null;
  page_title: string | null;
  referrer: string | null;
  user_agent: string | null;
  ip: string | null;
  metadata: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  created_at: CreatedAt;
}

export interface AccessRequestsTable {
  id: Generated<string>;
  name: string;
  email: string;
  organization: string;
  role: string;
  industry: string;
  team_size: string;
  product_stage: string;
  current_tools: Generated<string>;
  goals: string;
  status: Generated<'pending' | 'reviewing' | 'approved' | 'declined'>;
  review_note: Generated<string>;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface ContributionCategoriesTable {
  workspace_id: string;
  key: string;
  name: string;
  description: string;
  applicable_dimensions: ColumnType<string[], string | string[] | undefined, string | string[]>;
  active: Generated<boolean>;
  created_by: string | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface ContributionRubricsTable {
  workspace_id: string;
  version: string;
  weights: ColumnType<Record<string, number>, string | Record<string, number>, string | Record<string, number>>;
  conversion: 'one_point_per_score_point';
  active: Generated<boolean>;
  created_by: string | null;
  activated_by: string | null;
  created_at: CreatedAt;
  activated_at: Date | null;
}

export interface ContributionsTable {
  id: Generated<string>;
  workspace_id: string;
  submitted_by: string | null;
  idempotency_key: string;
  category_key: string;
  title: string;
  description: string;
  outcome: Generated<string>;
  expected_impact: Generated<string>;
  project_id: string | null;
  issue_id: string | null;
  task_id: string | null;
  product_id: string | null;
  status: Generated<'draft' | 'submitted' | 'revision_requested' | 'approved' | 'rejected' | 'disputed'>;
  disputed_from_status: 'approved' | 'rejected' | null;
  submitted_at: Date | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface ContributionParticipantsTable {
  id: Generated<string>;
  contribution_id: string;
  user_id: string | null;
  role_description: string;
  contribution_description: string;
  attribution_share: number;
  created_at: CreatedAt;
}

export interface ContributionEvidenceTable {
  id: Generated<string>;
  contribution_id: string;
  participant_id: string | null;
  source_type: 'url' | 'description' | 'project' | 'issue' | 'task' | 'product';
  url: string | null;
  description: string;
  project_id: string | null;
  issue_id: string | null;
  task_id: string | null;
  product_id: string | null;
  verified_by: string | null;
  verified_at: Date | null;
  removed_at: Date | null;
  created_at: CreatedAt;
}

export interface ContributionReviewsTable {
  id: Generated<string>;
  contribution_id: string;
  actor_id: string | null;
  decision: 'submitted' | 'revision_requested' | 'approved' | 'rejected' | 'disputed' | 'dispute_resolved';
  from_status: ContributionsTable['status'] | null;
  to_status: ContributionsTable['status'];
  notes: Generated<string>;
  created_at: CreatedAt;
}

export interface ContributionScoresTable {
  id: Generated<string>;
  workspace_id: string;
  contribution_id: string;
  user_id: string | null;
  version: number;
  rubric_version: string;
  ratings: ColumnType<Record<string, number | null>, string | Record<string, number | null>, string | Record<string, number | null>>;
  breakdown: ColumnType<Record<string, number | null>, string | Record<string, number | null>, string | Record<string, number | null>>;
  raw_score: number;
  attribution_share: number;
  awarded_xp: number;
  explanation: string;
  scored_by: string | null;
  supersedes_score_id: string | null;
  created_at: CreatedAt;
}

export interface ContributionAwardsTable {
  id: Generated<string>;
  workspace_id: string;
  contribution_id: string | null;
  user_id: string | null;
  score_id: string | null;
  idempotency_key: string;
  points: number;
  explanation: string;
  created_by: string | null;
  created_at: CreatedAt;
}

export interface ContributionHistoryTable {
  id: Generated<string>;
  contribution_id: string | null;
  workspace_id: string;
  actor_id: string | null;
  action: string;
  before_data: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  after_data: ColumnType<Record<string, unknown> | null, string | Record<string, unknown> | null, string | Record<string, unknown> | null>;
  reason: Generated<string>;
  created_at: CreatedAt;
}

export interface DemoAccessTable {
  ip_hash: string;
  token_hash: string;
  expires_at: Timestamp;
  created_at: CreatedAt;
}

export interface Database {
  users: UsersTable;
  workspaces: WorkspacesTable;
  projects: ProjectsTable;
  issues: IssuesTable;
  memberships: MembershipsTable;
  sessions: SessionsTable;
  invites: InvitesTable;
  password_resets: PasswordResetsTable;
  suppliers: SuppliersTable;
  materials: MaterialsTable;
  material_quotes: MaterialQuotesTable;
  products: ProductsTable;
  product_materials: ProductMaterialsTable;
  tasks: TasksTable;
  answers: AnswersTable;
  stage_history: StageHistoryTable;
  xp_events: XpEventsTable;
  analytics_events: AnalyticsEventsTable;
  access_requests: AccessRequestsTable;
  contribution_categories: ContributionCategoriesTable;
  contribution_rubrics: ContributionRubricsTable;
  contributions: ContributionsTable;
  contribution_participants: ContributionParticipantsTable;
  contribution_evidence: ContributionEvidenceTable;
  contribution_reviews: ContributionReviewsTable;
  contribution_scores: ContributionScoresTable;
  contribution_awards: ContributionAwardsTable;
  contribution_history: ContributionHistoryTable;
  demo_access: DemoAccessTable;
}

export type UserRow = Selectable<UsersTable>;
export type ProductRow = Selectable<ProductsTable>;
export type NewProduct = Insertable<ProductsTable>;
export type ProductUpdate = Updateable<ProductsTable>;
