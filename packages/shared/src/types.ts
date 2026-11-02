import type { AnswerValue } from './questions.js';
import type { CurrencyCode, Role, StageId, TaskStatus } from './stages.js';

/** Shapes exchanged between the API and the web app. */

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  isAdmin?: boolean;
}

export type WorkspaceMode = 'solo' | 'team';

export interface Workspace {
  mode: WorkspaceMode;
  id: string;
  name: string;
  currency: CurrencyCode;
  role: Role;
}

export interface Me {
  user: User;
  workspace: Workspace;
  workspaces: Workspace[];
  demo?: { expiresAt: string };
}

export interface ProductCosts {
  labour: number;
  packaging: number;
  overhead: number;
}

export interface BomLine {
  materialId: string;
  quantity: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  dueDate: string | null;
  position: number;
  completedAt: string | null;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  stage: StageId;
  imageUrl: string;
  description: string;
  notes: string;
  targetSellingPrice: number | null;
  costs: ProductCosts;
  materials: BomLine[];
  tasks: Task[];
  answers: Record<string, AnswerValue>;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierQuote {
  supplierId: string;
  quotedPrice: number;
  moq: number | null;
}

export interface Material {
  id: string;
  name: string;
  category: string;
  unit: string;
  unitPrice: number;
  description: string;
  sourceUrl: string;
  notes: string;
  suppliers: SupplierQuote[];
}

export interface Supplier {
  id: string;
  name: string;
  website: string;
  contact: string;
  notes: string;
}

export interface WorkspaceData {
  products: Product[];
  materials: Material[];
  suppliers: Supplier[];
}

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface Invite {
  id: string;
  role: Role;
  createdAt: string;
  expiresAt: string;
  createdBy: string;
  /** Only returned once, when the invite is created. */
  url?: string;
}

export interface XpEvent {
  id: string;
  kind: string;
  points: number;
  label: string;
  productId: string | null;
  createdAt: string;
}

export interface PlayerStats {
  xp: number;
  level: number;
  levelTitle: string;
  xpIntoLevel: number;
  xpForNextLevel: number;
  streakDays: number;
  weeklyXp: number;
  achievements: { id: string; unlocked: boolean }[];
  recent: XpEvent[];
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  xp: number;
  weeklyXp: number;
  level: number;
}

export interface XpAward {
  points: number;
  label: string;
}

/** Every mutating endpoint may return XP that was just earned so the UI can celebrate. */
export interface WithXp<T> {
  data: T;
  xp: XpAward[];
}

export interface AdminOverviewStats {
  totalUsers: number;
  activeUsers: number;
  totalWorkspaces: number;
  totalProducts: number;
  stageCounts: Record<string, number>;
  recentUsers: { id: string; name: string; email: string; createdAt: string }[];
  recentProducts: { id: string; name: string; stage: string; workspaceName: string; createdAt: string }[];
  recentWorkspaces?: { id: string; name: string; currency: CurrencyCode; createdAt: string; memberCount: number }[];
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  isDisabled: boolean;
  failedLogins: number;
  lastLoginAt: string | null;
  createdAt: string;
  workspaces: { id: string; name: string; role: Role }[];
  productCount: number;
}

export interface AdminWorkspaceMember {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export interface AdminWorkspace {
  id: string;
  name: string;
  currency: CurrencyCode;
  createdAt: string;
  memberCount: number;
  members: AdminWorkspaceMember[];
  productCount: number;
  materialCount: number;
  supplierCount: number;
}

export interface AdminProduct {
  id: string;
  name: string;
  category: string;
  stage: StageId;
  imageUrl: string;
  description: string;
  targetSellingPrice: number | null;
  workspaceId: string;
  workspaceName: string;
  createdBy: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  materialsCount: number;
  tasksCount: number;
  createdAt: string;
  updatedAt: string;
}

export type AccessRequestStatus = 'pending' | 'reviewing' | 'needs_info' | 'approved' | 'declined';

export const ACCESS_REQUEST_ROLES = [
  'Founder / business owner',
  'Engineering leader',
  'R&D leader',
  'Product manager',
  'Designer',
  'Engineer',
  'Operations / finance',
  'Other'
] as const;

export const ACCESS_REQUEST_INDUSTRIES = [
  'Aerospace & defense',
  'Hardware & robotics',
  'Automotive & mobility',
  'Medical devices',
  'Energy & infrastructure',
  'Industrial & manufacturing',
  'Software & technology',
  'Consumer products',
  'Other'
] as const;

export const ACCESS_REQUEST_TEAM_SIZES = ['Just me', '2–5', '6–20', '21–50', '51–199', '200+', '51+'] as const;

export const ACCESS_REQUEST_STAGES = [
  'Idea',
  'Research',
  'Planning',
  'Design',
  'Prototype',
  'Testing',
  'Launch',
  'Improvement'
] as const;

export interface EducationRequestDetails { educationalLevel: string; teacherCount: number | null; programmes: string; campuses: number | null; specialRequirements: string; }
export interface AdminAccessRequest {
  educationDetails: EducationRequestDetails | null;
  educationPricingSnapshot: import('./education-pricing.js').EducationPricingQuote | null;
  proposedEducationPricingSnapshot: import('./education-pricing.js').EducationPricingQuote | null;
  country: string | null;
  pricingSnapshot: import('./pricing.js').PricingQuote | null;
  proposedPricingSnapshot: import('./pricing.js').PricingQuote | null;
  id: string;
  name: string;
  email: string;
  organization: string;
  role: string;
  industry: string;
  teamSize: string | null;
  productStage: string | null;
  currentTools: string;
  goals: string;
  status: AccessRequestStatus;
  reviewNote: string;
  reviewedAt: string | null;
  createdAt: string;
}

export type AnalyticsEventType = 'page_view' | 'login' | 'logout' | 'action' | 'interaction';

export interface AnalyticsEventInput {
  type: AnalyticsEventType;
  name: string;
  pagePath?: string;
  pageTitle?: string;
  referrer?: string;
  anonymousId?: string;
  metadata?: Record<string, unknown>;
}

export interface AnalyticsEventRecord {
  id: string;
  eventType: AnalyticsEventType;
  eventName: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  pagePath: string | null;
  pageTitle: string | null;
  referrer: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface AnalyticsLoginRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  workspaceId: string | null;
  workspaceName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AnalyticsPageViewStat {
  path: string;
  title: string | null;
  views: number;
  uniqueVisitors: number;
  uniqueUsers: number;
}

export interface AnalyticsEventStat {
  name: string;
  count: number;
  uniqueUsers: number;
}

export interface AnalyticsTimeSeriesPoint {
  date: string;
  pageViews: number;
  actions: number;
  logins: number;
  activeUsers: number;
}

export interface AnalyticsUserSummary {
  userId: string;
  name: string;
  email: string;
  totalLogins: number;
  lastLoginAt: string | null;
  totalPageViews: number;
  totalActions: number;
  lastActiveAt: string | null;
  topPages: string[];
  recentEvents: { name: string; type: string; createdAt: string }[];
}

export interface AnalyticsOverview {
  totalPageViews: number;
  uniqueVisitors: number;
  totalLogins: number;
  totalActions: number;
  activeUsersToday: number;
  timeRange: '24h' | '7d' | '30d' | 'all';
  timeSeries: AnalyticsTimeSeriesPoint[];
  topPages: AnalyticsPageViewStat[];
  topEvents: AnalyticsEventStat[];
  deviceBreakdown: { device: string; count: number }[];
  browserBreakdown: { browser: string; count: number }[];
}

export interface CookieConsent {
  essential: boolean;
  analytics: boolean;
  decidedAt: string;
}
