import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { Role, StageId, TaskStatus } from '@sv/shared';

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
  is_disabled: Generated<boolean>;
  failed_logins: Generated<number>;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: CreatedAt;
}

export interface WorkspacesTable {
  id: Generated<string>;
  name: string;
  currency: Generated<string>;
  created_at: CreatedAt;
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

export interface Database {
  users: UsersTable;
  workspaces: WorkspacesTable;
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
}

export type UserRow = Selectable<UsersTable>;
export type ProductRow = Selectable<ProductsTable>;
export type NewProduct = Insertable<ProductsTable>;
export type ProductUpdate = Updateable<ProductsTable>;
