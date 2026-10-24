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

export interface Workspace {
  id: string;
  name: string;
  currency: CurrencyCode;
  role: Role;
}

export interface Me {
  user: User;
  workspace: Workspace;
  workspaces: Workspace[];
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
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
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

