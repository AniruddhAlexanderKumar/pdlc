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
  /** Per-account workspace shell preferences. */
  app_layout: ColumnType<unknown, string | null | undefined, string | null>;
  created_at: CreatedAt;
}

export interface WorkspacesTable {
  mode: Generated<'solo' | 'team'>;
  allow_unrestricted_reviews: Generated<boolean>;
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

export interface DemoGuestsTable {
  user_id: string;
  workspace_id: string;
  expires_at: Date;
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
  team_size: string | null;
  country: string | null;
  pricing_snapshot: ColumnType<import('@sv/shared').PricingQuote | null, string | null | undefined, string | null>;
  proposed_pricing_snapshot: ColumnType<import('@sv/shared').PricingQuote | null, string | null | undefined, string | null>;
  education_details: ColumnType<import('@sv/shared').EducationRequestDetails | null, string | null | undefined, string | null>;
  education_pricing_snapshot: ColumnType<import('@sv/shared').EducationPricingQuote | null, string | null | undefined, string | null>;
  proposed_education_pricing_snapshot: ColumnType<import('@sv/shared').EducationPricingQuote | null, string | null | undefined, string | null>;
  product_stage: string | null;
  current_tools: Generated<string>;
  goals: string;
  status: Generated<'pending' | 'reviewing' | 'needs_info' | 'approved' | 'declined'>;
  review_note: Generated<string>;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  created_at: CreatedAt;
  updated_at: Timestamp;
}

export interface IssueRelationshipsTable {
  id: Generated<string>; workspace_id: string; source_issue_id: string; target_issue_id: string;
  relationship_type: 'depends_on' | 'relates_to'; description: Generated<string>;
  created_by: string | null; created_at: CreatedAt;
}
export interface IssueRelationshipEventsTable {
  id: Generated<string>; workspace_id: string; relationship_id: string; source_issue_id: string;
  target_issue_id: string; relationship_type: string; description: string;
  action: 'created' | 'updated' | 'deleted'; actor_id: string | null; created_at: CreatedAt;
}

export interface HelpArticlesTable {id:Generated<string>;slug:string;title:string;summary:string;body:string;category:string;keywords:Generated<string[]>;audience:'everyone'|'workspace_admin';status:'draft'|'published'|'archived';created_at:CreatedAt;updated_at:Timestamp}
export interface HelpArticleRevisionsTable {id:Generated<string>;article_id:string;actor_id:string|null;snapshot:ColumnType<unknown,string,never>;created_at:CreatedAt}
export interface HelpProgressTable {user_id:string;workspace_id:string;guide_key:string;step:Generated<number>;completed:Generated<boolean>;updated_at:Timestamp}
export interface SupportTicketsTable {id:Generated<string>;workspace_id:string;user_id:string;project_id:string|null;category:string;feature:string;description:string;status:Generated<'open'|'in_progress'|'closed'>;created_at:CreatedAt;updated_at:Timestamp}

export interface AccessRequestEventsTable { id: Generated<string>; request_id: string; actor_id: string | null; old_status: string; new_status: string; proposal_snapshot: ColumnType<import('@sv/shared').PricingQuote | null, string | null, never>; created_at: CreatedAt }

export interface ExternalReviewsTable {
  id: Generated<string>; workspace_id: string; project_id: string; created_by: string | null; token_hash: string;
  title: string; instructions: Generated<string>; expires_at: Date | null; revoked_at: Date | null; reviewer_email: string | null;
  show_links: Generated<boolean>; access_count: Generated<number>; last_accessed_at: Date | null; created_at: CreatedAt; updated_at: Timestamp;
}
export interface ExternalReviewIssuesTable { review_id: string; issue_id: string }
export interface ExternalReviewEventsTable { id: Generated<string>; review_id: string; event_type: string; created_at: CreatedAt }
export interface ExternalReviewChallengesTable { review_id: string; code_hash: string; expires_at: Date; sent_at: Date; attempts: Generated<number> }
export interface ExternalReviewSessionsTable { id: string; review_id: string; expires_at: Date }

export interface Database {
  users: UsersTable;
  workspaces: WorkspacesTable;
  projects: ProjectsTable;
  issues: IssuesTable;
  issue_relationships: IssueRelationshipsTable;
  issue_relationship_events: IssueRelationshipEventsTable;
  memberships: MembershipsTable;
  sessions: SessionsTable;
  demo_guests: DemoGuestsTable;
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
  access_request_events: AccessRequestEventsTable;
  help_articles: HelpArticlesTable;
  help_article_revisions: HelpArticleRevisionsTable;
  help_progress: HelpProgressTable;
  support_tickets: SupportTicketsTable;
  external_reviews: ExternalReviewsTable;
  external_review_issues: ExternalReviewIssuesTable;
  external_review_events: ExternalReviewEventsTable;
  external_review_challenges: ExternalReviewChallengesTable;
  external_review_sessions: ExternalReviewSessionsTable;
}

export type UserRow = Selectable<UsersTable>;
export type ProductRow = Selectable<ProductsTable>;
export type NewProduct = Insertable<ProductsTable>;
export type ProductUpdate = Updateable<ProductsTable>;
