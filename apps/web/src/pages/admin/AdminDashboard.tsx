import { useState, useMemo, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  KeyRound,
  Layers,
  LayoutGrid,
  LogOut,
  Moon,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  Sun,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX
} from 'lucide-react';
import {
  CURRENCIES,
  STAGES,
  currencySymbol,
  getStage,
  type AdminOverviewStats,
  type AdminAccessRequest,
  type AdminProduct,
  type AdminUser,
  type AdminWorkspace,
  type CurrencyCode,
  type Me,
  type Role,
  type StageId
} from '@sv/shared';
import { del, get, patch, post } from '../../api/client';
import { useResetSession, useSession } from '../../api/hooks';
import { useTheme } from '../../lib/theme';
import { useToast } from '../../components/Toast';
import { AnalyticsView } from '../../components/AnalyticsView';
import { AccessRequestsTab } from './AccessRequestsTab';
import {
  Button,
  Card,
  CardHeader,
  ConfirmProvider,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  ProgressBar,
  Select,
  Spinner,
  StageBadge,
  cx,
  useConfirm
} from '../../components/ui';

export function AdminDashboard() {
  const me = useSession();
  const resetSession = useResetSession();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const location = useLocation();

  const queryTab = new URLSearchParams(location.search).get('tab');
  const initialTab =
    location.pathname === '/analytics' || queryTab === 'analytics'
      ? 'analytics'
      : 'overview';
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'organizations' | 'products' | 'analytics' | 'access-requests'>(initialTab);

  // Search & Filter state
  const [userSearch, setUserSearch] = useState('');
  const [userStatusFilter, setUserStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');

  const [orgSearch, setOrgSearch] = useState('');

  const [prodSearch, setProdSearch] = useState('');
  const [prodOrgFilter, setProdOrgFilter] = useState<string>('all');
  const [prodStageFilter, setProdStageFilter] = useState<string>('all');

  // Modals state
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [resettingUserPw, setResettingUserPw] = useState<AdminUser | null>(null);
  const [viewingUser, setViewingUser] = useState<AdminUser | null>(null);

  const [addOrgOpen, setAddOrgOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<AdminWorkspace | null>(null);
  const [managingOrgMembers, setManagingOrgMembers] = useState<AdminWorkspace | null>(null);

  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);

  // Queries
  const overviewQuery = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => get<AdminOverviewStats>('/admin/overview')
  });

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => get<AdminUser[]>('/admin/users')
  });

  const orgsQuery = useQuery({
    queryKey: ['admin-workspaces'],
    queryFn: () => get<AdminWorkspace[]>('/admin/workspaces')
  });

  const productsQuery = useQuery({
    queryKey: ['admin-products'],
    queryFn: () => get<AdminProduct[]>('/admin/products')
  });

  const accessRequestsQuery = useQuery({
    queryKey: ['admin-access-requests'],
    queryFn: () => get<AdminAccessRequest[]>('/admin/access-requests')
  });

  // Mutations
  const logout = useMutation({
    mutationFn: () => post('/auth/logout'),
    onSettled: () => {
      resetSession(null);
      navigate('/login');
    }
  });

  const switchWsMutation = useMutation({
    mutationFn: (workspaceId: string) => post<Me>('/auth/switch-workspace', { workspaceId }),
    onSuccess: (m) => {
      resetSession(m);
      navigate('/');
      toast.success(`Switched to workspace ${m.workspace.name}`);
    }
  });

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['admin-overview'] });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
    qc.invalidateQueries({ queryKey: ['admin-products'] });
    qc.invalidateQueries({ queryKey: ['admin-access-requests'] });
    toast.success('Admin data refreshed');
  };

  // Filtered lists
  const filteredUsers = useMemo(() => {
    if (!usersQuery.data) return [];
    return usersQuery.data.filter((u) => {
      const matchText =
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.workspaces.some((w) => w.name.toLowerCase().includes(userSearch.toLowerCase()));
      if (!matchText) return false;
      if (userStatusFilter === 'active') return !u.isDisabled;
      if (userStatusFilter === 'disabled') return u.isDisabled;
      return true;
    });
  }, [usersQuery.data, userSearch, userStatusFilter]);

  const filteredOrgs = useMemo(() => {
    if (!orgsQuery.data) return [];
    return orgsQuery.data.filter((w) => w.name.toLowerCase().includes(orgSearch.toLowerCase()));
  }, [orgsQuery.data, orgSearch]);

  const filteredProducts = useMemo(() => {
    if (!productsQuery.data) return [];
    return productsQuery.data.filter((p) => {
      const matchText =
        p.name.toLowerCase().includes(prodSearch.toLowerCase()) ||
        p.category.toLowerCase().includes(prodSearch.toLowerCase()) ||
        p.workspaceName.toLowerCase().includes(prodSearch.toLowerCase()) ||
        (p.creatorName && p.creatorName.toLowerCase().includes(prodSearch.toLowerCase())) ||
        (p.creatorEmail && p.creatorEmail.toLowerCase().includes(prodSearch.toLowerCase()));
      if (!matchText) return false;
      if (prodOrgFilter !== 'all' && p.workspaceId !== prodOrgFilter) return false;
      if (prodStageFilter !== 'all' && p.stage !== prodStageFilter) return false;
      return true;
    });
  }, [productsQuery.data, prodSearch, prodOrgFilter, prodStageFilter]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col">
      {/* Top Admin Navigation Bar */}
      <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-tight text-base">Solution Velocity</span>
                <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400 border border-amber-500/20">
                  ADMIN CONSOLE
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">Global System Management & Cross-Workspace Control</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Button
              variant="secondary"
              size="sm"
              icon={<RefreshCw className="h-3.5 w-3.5" />}
              onClick={refreshAll}
              title="Refresh admin records"
            >
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<LayoutGrid className="h-4 w-4 text-blue-500" />}
              onClick={() => navigate('/')}
              title="Switch to user workspace dashboard"
            >
              <span className="hidden sm:inline">Open PDLC View</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              icon={<Settings className="h-4 w-4" />}
              onClick={() => navigate('/settings?section=dashboard')}
              aria-label="Dashboard personalization settings"
              title="Dashboard personalization settings"
            >
              <span className="hidden sm:inline">Settings</span>
            </Button>

            <IconButton label="Toggle theme" onClick={toggle}>
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </IconButton>

            <div className="hidden md:flex flex-col text-right pl-2 border-l border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-semibold">{me.user.name}</span>
              <span className="text-[11px] text-zinc-400">{me.user.email}</span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
              icon={<LogOut className="h-4 w-4" />}
              onClick={() => logout.mutate()}
            >
              Sign out
            </Button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl px-4 pb-2 sm:px-6"><Link to="/admin/help" className="text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400">Manage help articles & support tickets →</Link></div>
        {/* Tab Navigation */}
        <div className="border-t border-zinc-200/80 bg-zinc-50/50 px-4 sm:px-6 dark:border-zinc-800/80 dark:bg-zinc-900/50">
          <div className="mx-auto flex max-w-7xl gap-1 overflow-x-auto sm:gap-2">
            {[
              { id: 'overview', label: 'Overview & Health', icon: Activity },
              { id: 'analytics', label: 'Server Analytics', icon: BarChart3 },
              { id: 'users', label: 'Users Management', icon: Users, count: usersQuery.data?.length },
              { id: 'organizations', label: 'Organizations', icon: Building2, count: orgsQuery.data?.length },
              { id: 'products', label: 'All Products', icon: Package, count: productsQuery.data?.length },
              {
                id: 'access-requests',
                label: 'Access Requests',
                icon: ClipboardList,
                count: accessRequestsQuery.data?.filter((request) => request.status === 'pending').length ?? 0
              }
            ].map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={cx(
                    'flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs sm:text-sm font-medium transition-colors',
                    active
                      ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                      : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:hover:border-zinc-700 dark:hover:text-zinc-300'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={cx(
                        'ml-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                        active
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {/* TAB 1: OVERVIEW */}
        {activeTab === 'overview' && (
          <OverviewTab
            stats={overviewQuery.data}
            loading={overviewQuery.isLoading}
            onSelectTab={setActiveTab}
          />
        )}

        {/* TAB: ANALYTICS */}
        {activeTab === 'analytics' && (
          <AnalyticsView
            isAdmin
            title="System Analytics & Activity"
            subtitle="Server-hosted platform telemetry, active sessions, page views, and user actions."
          />
        )}

        {activeTab === 'access-requests' && (
          <AccessRequestsTab
            requests={accessRequestsQuery.data ?? []}
            loading={accessRequestsQuery.isLoading}
            error={accessRequestsQuery.error instanceof Error ? accessRequestsQuery.error.message : accessRequestsQuery.isError ? 'Could not load access requests.' : null}
            onRetry={() => void accessRequestsQuery.refetch()}
          />
        )}

        {/* TAB 2: USERS */}
        {activeTab === 'users' && (
          <UsersTab
            users={filteredUsers}
            totalCount={usersQuery.data?.length ?? 0}
            loading={usersQuery.isLoading}
            search={userSearch}
            setSearch={setUserSearch}
            statusFilter={userStatusFilter}
            setStatusFilter={setUserStatusFilter}
            onAddUser={() => setAddUserOpen(true)}
            onEditUser={setEditingUser}
            onResetPassword={setResettingUserPw}
            onViewUser={setViewingUser}
            currentUserId={me.user.id}
          />
        )}

        {/* TAB 3: ORGANIZATIONS */}
        {activeTab === 'organizations' && (
          <OrganizationsTab
            workspaces={filteredOrgs}
            totalCount={orgsQuery.data?.length ?? 0}
            loading={orgsQuery.isLoading}
            search={orgSearch}
            setSearch={setOrgSearch}
            onAddOrg={() => setAddOrgOpen(true)}
            onEditOrg={setEditingOrg}
            onManageMembers={setManagingOrgMembers}
            onSwitchOrg={(id) => switchWsMutation.mutate(id)}
          />
        )}

        {/* TAB 4: PRODUCTS */}
        {activeTab === 'products' && (
          <ProductsTab
            products={filteredProducts}
            totalCount={productsQuery.data?.length ?? 0}
            loading={productsQuery.isLoading}
            search={prodSearch}
            setSearch={setProdSearch}
            orgFilter={prodOrgFilter}
            setOrgFilter={setProdOrgFilter}
            stageFilter={prodStageFilter}
            setStageFilter={setProdStageFilter}
            workspaces={orgsQuery.data ?? []}
            onEditProduct={setEditingProduct}
            onOpenProduct={(wsId, prodId) => {
              switchWsMutation.mutate(wsId, {
                onSuccess: () => navigate(`/products/${prodId}`)
              });
            }}
          />
        )}
      </main>

      {/* Modals */}
      {addUserOpen && (
        <AddUserModal
          workspaces={orgsQuery.data ?? []}
          onClose={() => setAddUserOpen(false)}
        />
      )}

      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}

      {resettingUserPw && (
        <ResetPasswordModal
          user={resettingUserPw}
          onClose={() => setResettingUserPw(null)}
        />
      )}

      {viewingUser && (
        <ViewUserModal
          user={viewingUser}
          onClose={() => setViewingUser(null)}
          onEdit={() => {
            const u = viewingUser;
            setViewingUser(null);
            setEditingUser(u);
          }}
        />
      )}

      {addOrgOpen && (
        <AddOrgModal
          users={usersQuery.data ?? []}
          onClose={() => setAddOrgOpen(false)}
        />
      )}

      {editingOrg && (
        <EditOrgModal
          workspace={editingOrg}
          onClose={() => setEditingOrg(null)}
        />
      )}

      {managingOrgMembers && (
        <ManageOrgMembersModal
          workspace={managingOrgMembers}
          allUsers={usersQuery.data ?? []}
          onClose={() => setManagingOrgMembers(null)}
        />
      )}

      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          workspaces={orgsQuery.data ?? []}
          onClose={() => setEditingProduct(null)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-TAB 1: Overview
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({
  stats,
  loading,
  onSelectTab
}: {
  stats?: AdminOverviewStats;
  loading: boolean;
  onSelectTab: (tab: 'overview' | 'users' | 'organizations' | 'products' | 'analytics' | 'access-requests') => void;
}) {
  if (loading || !stats) return <Spinner label="Loading administrative statistics" />;

  return (
    <div className="space-y-6">
      {/* 4 Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4 border-l-4 border-l-blue-600">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total Users</p>
            <div className="rounded-lg bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
              <Users className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.totalUsers}</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-zinc-500">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
            <span>{stats.activeUsers} active accounts</span>
            {stats.totalUsers - stats.activeUsers > 0 && (
              <span className="text-rose-500">({stats.totalUsers - stats.activeUsers} disabled)</span>
            )}
          </div>
        </Card>

        <Card className="p-4 border-l-4 border-l-emerald-600">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Organizations</p>
            <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
              <Building2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.totalWorkspaces}</p>
          <p className="mt-2 text-xs text-zinc-500">Active workspaces hosted</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-sky-600">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total Products</p>
            <div className="rounded-lg bg-sky-500/10 p-2 text-sky-600 dark:text-sky-400">
              <Package className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{stats.totalProducts}</p>
          <p className="mt-2 text-xs text-zinc-500">Across all stages of development</p>
        </Card>

        <Card className="p-4 border-l-4 border-l-amber-600">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">System Status</p>
            <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">Healthy</p>
          <p className="mt-2 text-xs text-zinc-500">PostgreSQL database active & responsive</p>
        </Card>
      </div>

      {/* Analytics & Activity Quick Card */}
      <Card className="overflow-hidden border-blue-100 bg-gradient-to-r from-blue-50/50 via-white to-transparent dark:border-blue-900/30 dark:from-blue-950/20 dark:via-zinc-900 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-400/10 dark:text-blue-400">
              <BarChart3 className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Server Hosted Analytics</h3>
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Audit trail of who logged in, which pages they visited, and user actions performed.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            icon={<ArrowRight className="h-4 w-4" />}
            onClick={() => onSelectTab('analytics')}
          >
            Open Server Analytics
          </Button>
        </div>
      </Card>

      {/* Stage Distribution Funnel */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-sm">Product Development Lifecycle Distribution</h3>
            <p className="text-xs text-zinc-500">Live breakdown of all products across lifecycle stages</p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => onSelectTab('products')}>
            View products <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {STAGES.map((s) => {
            const count = stats.stageCounts[s.id] ?? 0;
            const pct = stats.totalProducts > 0 ? Math.round((count / stats.totalProducts) * 100) : 0;
            return (
              <div key={s.id} className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{s.label}</span>
                  <span className="text-sm font-bold tabular-nums">{count}</span>
                </div>
                <div className="mt-2">
                  <ProgressBar value={pct} />
                </div>
                <span className="mt-1 block text-[10px] text-zinc-400 tabular-nums">{pct}% of total</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Two Column: Recent Users & Recent Products */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Users */}
        <Card>
          <CardHeader
            title="Recent User Registrations"
            subtitle="Latest accounts registered in the system"
            action={
              <Button variant="ghost" size="sm" onClick={() => onSelectTab('users')}>
                Manage users <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {stats.recentUsers.length === 0 ? (
              <p className="p-4 text-xs text-zinc-500">No users found.</p>
            ) : (
              stats.recentUsers.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-600 dark:text-blue-400">
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-medium">{u.name}</p>
                      <p className="text-[11px] text-zinc-400">{u.email}</p>
                    </div>
                  </div>
                  <span className="text-[11px] text-zinc-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Recent Products */}
        <Card>
          <CardHeader
            title="Recent Products"
            subtitle="Latest products added across all organizations"
            action={
              <Button variant="ghost" size="sm" onClick={() => onSelectTab('products')}>
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            }
          />
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {stats.recentProducts.length === 0 ? (
              <p className="p-4 text-xs text-zinc-500">No products found.</p>
            ) : (
              stats.recentProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                      <Package className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{p.name}</p>
                      <p className="text-[11px] text-zinc-400">in {p.workspaceName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StageBadge stage={p.stage} />
                    <span className="text-[11px] text-zinc-400">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-TAB 2: Users Management
// ─────────────────────────────────────────────────────────────────────────────

function UsersTab({
  users,
  totalCount,
  loading,
  search,
  setSearch,
  statusFilter,
  setStatusFilter,
  onAddUser,
  onEditUser,
  onResetPassword,
  onViewUser,
  currentUserId
}: {
  users: AdminUser[];
  totalCount: number;
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  statusFilter: 'all' | 'active' | 'disabled';
  setStatusFilter: (f: 'all' | 'active' | 'disabled') => void;
  onAddUser: () => void;
  onEditUser: (u: AdminUser) => void;
  onResetPassword: (u: AdminUser) => void;
  onViewUser: (u: AdminUser) => void;
  currentUserId: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const toggleDisableMutation = useMutation({
    mutationFn: ({ userId, isDisabled }: { userId: string; isDisabled: boolean }) =>
      patch<AdminUser>(`/admin/users/${userId}`, { isDisabled }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success(updated.isDisabled ? 'User has been disabled' : 'User enabled successfully');
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => del(`/admin/users/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success('User deleted successfully');
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const handleDelete = async (u: AdminUser) => {
    if (u.id === currentUserId || u.isAdmin) {
      toast.error('Cannot delete a system admin account or your active account.');
      return;
    }
    const ok = await confirm({
      title: `Delete user "${u.name}"?`,
      body: `This permanently removes ${u.email} and revokes their workspace memberships. This action cannot be undone.`,
      confirmLabel: 'Delete user',
      danger: true
    });
    if (ok) deleteUserMutation.mutate(u.id);
  };

  return (
    <div className="space-y-4">
      {/* Action Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2 max-w-md">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="search"
              placeholder="Search by name, email, or organization…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-32"
          >
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            Showing {users.length} of {totalCount} users
          </span>
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={onAddUser}>
            Add User
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <Spinner label="Loading users" />
        ) : users.length === 0 ? (
          <EmptyState
            icon={<Users className="h-6 w-6" />}
            title="No users found"
            body={search ? 'Try adjusting your search filters.' : 'No users registered yet.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Organizations</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Last Login</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {users.map((u) => {
                  const isAdminUser = u.isAdmin;
                  return (
                    <tr key={u.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-700 dark:text-blue-300">
                            {u.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-zinc-900 dark:text-zinc-100">{u.name}</span>
                              {isAdminUser && (
                                <span className="rounded bg-blue-500/10 px-1.5 py-0.2 text-[10px] font-semibold text-blue-700 dark:text-blue-400 border border-blue-500/20">
                                  SUPERADMIN
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-zinc-400">{u.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {u.workspaces.length === 0 ? (
                            <span className="text-zinc-400 text-xs italic">No workspace</span>
                          ) : (
                            u.workspaces.map((w) => (
                              <span
                                key={w.id}
                                className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                <span>{w.name}</span>
                                <span className="text-[9px] uppercase font-bold text-zinc-400">({w.role})</span>
                              </span>
                            ))
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 tabular-nums font-medium text-zinc-600 dark:text-zinc-300">
                        {u.productCount}
                      </td>

                      <td className="px-4 py-3">
                        {u.isDisabled ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-400 border border-rose-500/20">
                            <UserX className="h-3 w-3" /> Disabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <UserCheck className="h-3 w-3" /> Active
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-xs text-zinc-500 tabular-nums">
                        {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewUser(u)}
                            title="View details"
                          >
                            Details
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEditUser(u)}
                            title="Edit user info"
                          >
                            Edit
                          </Button>

                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<KeyRound className="h-3.5 w-3.5" />}
                            onClick={() => onResetPassword(u)}
                            title="Reset password"
                          >
                            Reset Pw
                          </Button>

                          {!isAdminUser && u.id !== currentUserId && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className={u.isDisabled ? 'text-emerald-600' : 'text-amber-600'}
                                onClick={() =>
                                  toggleDisableMutation.mutate({
                                    userId: u.id,
                                    isDisabled: !u.isDisabled
                                  })
                                }
                                title={u.isDisabled ? 'Enable user' : 'Disable user'}
                              >
                                {u.isDisabled ? 'Enable' : 'Disable'}
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-rose-600 hover:bg-rose-500/10"
                                icon={<Trash2 className="h-3.5 w-3.5" />}
                                onClick={() => handleDelete(u)}
                                title="Delete user"
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-TAB 3: Organizations Management
// ─────────────────────────────────────────────────────────────────────────────

function OrganizationsTab({
  workspaces,
  totalCount,
  loading,
  search,
  setSearch,
  onAddOrg,
  onEditOrg,
  onManageMembers,
  onSwitchOrg
}: {
  workspaces: AdminWorkspace[];
  totalCount: number;
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  onAddOrg: () => void;
  onEditOrg: (w: AdminWorkspace) => void;
  onManageMembers: (w: AdminWorkspace) => void;
  onSwitchOrg: (id: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const deleteOrgMutation = useMutation({
    mutationFn: (wsId: string) => del(`/admin/workspaces/${wsId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success('Organization deleted successfully');
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const handleDelete = async (w: AdminWorkspace) => {
    const ok = await confirm({
      title: `Delete organization "${w.name}"?`,
      body: `This permanently deletes the workspace and its ${w.productCount} products, ${w.materialCount} materials, and memberships. This cannot be undone.`,
      confirmLabel: 'Delete organization',
      danger: true
    });
    if (ok) deleteOrgMutation.mutate(w.id);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            type="search"
            placeholder="Search organizations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">
            Showing {workspaces.length} of {totalCount} organizations
          </span>
          <Button icon={<Plus className="h-4 w-4" />} onClick={onAddOrg}>
            New Organization
          </Button>
        </div>
      </div>

      {/* Organizations Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <Spinner label="Loading organizations" />
        ) : workspaces.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="No organizations found"
            body={search ? 'No organizations match your query.' : 'Create your first organization.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Organization</th>
                  <th className="px-4 py-3">Currency</th>
                  <th className="px-4 py-3">Members</th>
                  <th className="px-4 py-3">Products</th>
                  <th className="px-4 py-3">BOM Catalog</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {workspaces.map((w) => (
                  <tr key={w.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{w.name}</p>
                          <p className="text-[11px] text-zinc-400 font-mono">ID: {w.id.slice(0, 8)}…</p>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {w.currency} ({currencySymbol(w.currency)})
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium tabular-nums">{w.memberCount} members</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-[11px] text-blue-600 dark:text-blue-400"
                          onClick={() => onManageMembers(w)}
                        >
                          Manage
                        </Button>
                      </div>
                    </td>

                    <td className="px-4 py-3 tabular-nums font-medium text-zinc-700 dark:text-zinc-300">
                      {w.productCount}
                    </td>

                    <td className="px-4 py-3 text-xs text-zinc-500">
                      <span>{w.materialCount} materials</span>
                      <span className="mx-1">·</span>
                      <span>{w.supplierCount} suppliers</span>
                    </td>

                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {new Date(w.createdAt).toLocaleDateString()}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<ExternalLink className="h-3.5 w-3.5" />}
                          onClick={() => onSwitchOrg(w.id)}
                          title="Switch to this workspace in PDLC"
                        >
                          View PDLC
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditOrg(w)}
                          title="Edit organization"
                        >
                          Edit
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-500/10"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => handleDelete(w)}
                          title="Delete organization"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-TAB 4: Products Management
// ─────────────────────────────────────────────────────────────────────────────

function ProductsTab({
  products,
  totalCount,
  loading,
  search,
  setSearch,
  orgFilter,
  setOrgFilter,
  stageFilter,
  setStageFilter,
  workspaces,
  onEditProduct,
  onOpenProduct
}: {
  products: AdminProduct[];
  totalCount: number;
  loading: boolean;
  search: string;
  setSearch: (s: string) => void;
  orgFilter: string;
  setOrgFilter: (s: string) => void;
  stageFilter: string;
  setStageFilter: (s: string) => void;
  workspaces: AdminWorkspace[];
  onEditProduct: (p: AdminProduct) => void;
  onOpenProduct: (workspaceId: string, productId: string) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();

  const deleteProductMutation = useMutation({
    mutationFn: (prodId: string) => del(`/admin/products/${prodId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success('Product deleted successfully');
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const handleDelete = async (p: AdminProduct) => {
    const ok = await confirm({
      title: `Delete product "${p.name}"?`,
      body: `This permanently deletes the product, its BOM lines, and tasks in workspace "${p.workspaceName}".`,
      confirmLabel: 'Delete product',
      danger: true
    });
    if (ok) deleteProductMutation.mutate(p.id);
  };

  return (
    <div className="space-y-4">
      {/* Filters Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input
              type="search"
              placeholder="Search by product name, category, or owner…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <Select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="w-44"
          >
            <option value="all">All Organizations</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>

          <Select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="w-36"
          >
            <option value="all">All Stages</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        <span className="text-xs text-zinc-500">
          Showing {products.length} of {totalCount} products
        </span>
      </div>

      {/* Products Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <Spinner label="Loading products" />
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title="No products found"
            body={search ? 'No products match your filters.' : 'No products exist across any organization.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Organization</th>
                  <th className="px-4 py-3">Stage</th>
                  <th className="px-4 py-3">Target Price</th>
                  <th className="px-4 py-3">BOM / Tasks</th>
                  <th className="px-4 py-3">Created By</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {products.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
                          <Package className="h-4.5 w-4.5" />
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{p.name}</p>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.2 text-[10px] text-zinc-500 dark:bg-zinc-800">
                            {p.category}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-medium text-zinc-700 dark:text-zinc-300">
                        {p.workspaceName}
                      </span>
                    </td>

                    <td className="px-4 py-3">
                      <StageBadge stage={p.stage} />
                    </td>

                    <td className="px-4 py-3 tabular-nums font-medium text-zinc-700 dark:text-zinc-300">
                      {p.targetSellingPrice !== null ? `$${p.targetSellingPrice.toFixed(2)}` : '—'}
                    </td>

                    <td className="px-4 py-3 text-xs text-zinc-500">
                      <span>{p.materialsCount} materials</span>
                      <span className="mx-1">·</span>
                      <span>{p.tasksCount} tasks</span>
                    </td>

                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {p.creatorName ? (
                        <div>
                          <p className="font-medium text-zinc-700 dark:text-zinc-300">{p.creatorName}</p>
                          <p className="text-[10px] text-zinc-400">{p.creatorEmail}</p>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<ExternalLink className="h-3.5 w-3.5" />}
                          onClick={() => onOpenProduct(p.workspaceId, p.id)}
                          title="Open product detail in PDLC"
                        >
                          View in PDLC
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEditProduct(p)}
                          title="Edit product properties"
                        >
                          Edit
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-rose-600 hover:bg-rose-500/10"
                          icon={<Trash2 className="h-3.5 w-3.5" />}
                          onClick={() => handleDelete(p)}
                          title="Delete product"
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────────────────────

function AddUserModal({
  workspaces,
  onClose
}: {
  workspaces: AdminWorkspace[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    workspaceId: workspaces[0]?.id || '',
    role: 'member' as Role
  });

  const mutation = useMutation({
    mutationFn: () =>
      post('/admin/users', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        workspaceId: form.workspaceId || undefined,
        role: form.role
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success(`User ${form.email} created successfully`);
      onClose();
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Modal
      title="Add New User"
      subtitle="Create an account directly and assign to an organization"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} onClick={handleSubmit}>
            Create User
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full Name" htmlFor="user-name">
          <Input
            id="user-name"
            required
            placeholder="Maya Patel"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>

        <Field label="Email Address" htmlFor="user-email">
          <Input
            id="user-email"
            type="email"
            required
            placeholder="user@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </Field>

        <Field label="Initial Password" htmlFor="user-password">
          <Input
            id="user-password"
            type="text"
            required
            minLength={5}
            placeholder="Minimum 5 characters"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
        </Field>

        <Field label="Assign to Organization" htmlFor="user-ws">
          <Select
            id="user-ws"
            value={form.workspaceId}
            onChange={(e) => setForm((f) => ({ ...f, workspaceId: e.target.value }))}
          >
            <option value="">Create personal workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>

        {form.workspaceId && (
          <Field label="Organization Role" htmlFor="user-role">
            <Select
              id="user-role"
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </Select>
          </Field>
        )}
      </form>
    </Modal>
  );
}

function EditUserModal({
  user,
  onClose
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState({
    name: user.name,
    email: user.email,
    isDisabled: user.isDisabled
  });

  const mutation = useMutation({
    mutationFn: () =>
      patch(`/admin/users/${user.id}`, {
        name: form.name.trim(),
        email: form.email.trim(),
        isDisabled: form.isDisabled
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success('User updated successfully');
      onClose();
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Modal
      title={`Edit User: ${user.name}`}
      subtitle={`User ID: ${user.id.slice(0, 8)}…`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} onClick={handleSubmit}>
            Save Changes
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full Name" htmlFor="edit-user-name">
          <Input
            id="edit-user-name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>

        <Field label="Email Address" htmlFor="edit-user-email">
          <Input
            id="edit-user-email"
            type="email"
            required
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </Field>

        {!user.isAdmin && (
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="edit-user-disabled"
              checked={form.isDisabled}
              onChange={(e) => setForm((f) => ({ ...f, isDisabled: e.target.checked }))}
              className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="edit-user-disabled" className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Account is disabled (cannot sign in)
            </label>
          </div>
        )}
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose
}: {
  user: AdminUser;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => patch(`/admin/users/${user.id}`, { password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      toast.success(`Password reset for ${user.email}`);
      onClose();
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }
    mutation.mutate();
  };

  return (
    <Modal
      title="Reset User Password"
      subtitle={`Set a new password directly for ${user.name} (${user.email})`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} onClick={handleSubmit}>
            Update Password
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="New Password" htmlFor="reset-pw">
          <Input
            id="reset-pw"
            type="text"
            required
            minLength={4}
            placeholder="Enter new password…"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <p className="text-xs text-zinc-500">
          Resetting the password immediately updates the user credential and clears any temporary lockout.
        </p>
      </form>
    </Modal>
  );
}

function ViewUserModal({
  user,
  onClose,
  onEdit
}: {
  user: AdminUser;
  onClose: () => void;
  onEdit: () => void;
}) {
  return (
    <Modal
      title={user.name}
      subtitle={user.email}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={onEdit}>Edit Profile</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-zinc-200 p-3 text-xs dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
          <div>
            <span className="text-zinc-400">Account ID:</span>
            <p className="font-mono mt-0.5">{user.id}</p>
          </div>
          <div>
            <span className="text-zinc-400">Account Status:</span>
            <p className="mt-0.5 font-semibold text-emerald-600 dark:text-emerald-400">
              {user.isDisabled ? 'Disabled' : 'Active'}
            </p>
          </div>
          <div>
            <span className="text-zinc-400">Registered On:</span>
            <p className="mt-0.5">{new Date(user.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <span className="text-zinc-400">Last Login:</span>
            <p className="mt-0.5">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</p>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Joined Organizations ({user.workspaces.length})
          </h4>
          {user.workspaces.length === 0 ? (
            <p className="text-xs text-zinc-400 italic">No organizations associated.</p>
          ) : (
            <div className="space-y-2">
              {user.workspaces.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 p-2.5 text-xs dark:border-zinc-800"
                >
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-zinc-400" />
                    <span className="font-medium">{w.name}</span>
                  </div>
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 font-bold uppercase text-blue-700 dark:text-blue-300 text-[10px]">
                    {w.role}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function AddOrgModal({
  users,
  onClose
}: {
  users: AdminUser[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState({
    name: '',
    currency: 'USD' as CurrencyCode,
    ownerUserId: users[0]?.id || ''
  });

  const mutation = useMutation({
    mutationFn: () =>
      post('/admin/workspaces', {
        name: form.name.trim(),
        currency: form.currency,
        ownerUserId: form.ownerUserId || undefined
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success('Organization created successfully');
      onClose();
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Modal
      title="Create Organization"
      subtitle="Set up a new workspace for products, materials, and teams"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} onClick={handleSubmit}>
            Create Organization
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Organization / Workspace Name" htmlFor="org-name">
          <Input
            id="org-name"
            required
            placeholder="Acme Manufacturing Inc."
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>

        <Field label="Primary Currency" htmlFor="org-currency">
          <Select
            id="org-currency"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as CurrencyCode }))}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} ({currencySymbol(c)})
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Initial Organization Owner" htmlFor="org-owner">
          <Select
            id="org-owner"
            value={form.ownerUserId}
            onChange={(e) => setForm((f) => ({ ...f, ownerUserId: e.target.value }))}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.email})
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function EditOrgModal({
  workspace,
  onClose
}: {
  workspace: AdminWorkspace;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState({
    name: workspace.name,
    currency: workspace.currency
  });

  const mutation = useMutation({
    mutationFn: () =>
      patch(`/admin/workspaces/${workspace.id}`, {
        name: form.name.trim(),
        currency: form.currency
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success('Organization updated successfully');
      onClose();
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Modal
      title={`Edit Organization: ${workspace.name}`}
      subtitle={`ID: ${workspace.id.slice(0, 8)}…`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} onClick={handleSubmit}>
            Save Changes
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Organization Name" htmlFor="edit-org-name">
          <Input
            id="edit-org-name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>

        <Field label="Primary Currency" htmlFor="edit-org-currency">
          <Select
            id="edit-org-currency"
            value={form.currency}
            onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value as CurrencyCode }))}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c} ({currencySymbol(c)})
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}

function ManageOrgMembersModal({
  workspace,
  allUsers,
  onClose
}: {
  workspace: AdminWorkspace;
  allUsers: AdminUser[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [selectedUserId, setSelectedUserId] = useState(
    allUsers.find((u) => !workspace.members.some((m) => m.userId === u.id))?.id || ''
  );
  const [selectedRole, setSelectedRole] = useState<Role>('member');

  const addMemberMutation = useMutation({
    mutationFn: () =>
      post(`/admin/workspaces/${workspace.id}/members`, {
        userId: selectedUserId,
        role: selectedRole
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
      toast.success('Member added to organization');
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      patch(`/admin/workspaces/${workspace.id}/members/${userId}`, { role }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
      toast.success('Member role updated');
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => del(`/admin/workspaces/${workspace.id}/members/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-workspaces'] });
      toast.success('Member removed from organization');
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const nonMembers = allUsers.filter((u) => !workspace.members.some((m) => m.userId === u.id));

  return (
    <Modal
      title={`Members: ${workspace.name}`}
      subtitle="Manage team members and their permission roles"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="space-y-5">
        {/* Add Member Bar */}
        {nonMembers.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900/60">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Add Member</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="flex-1"
              >
                {nonMembers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </Select>
              <Select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as Role)}
                className="w-28"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </Select>
              <Button
                size="sm"
                loading={addMemberMutation.isPending}
                onClick={() => addMemberMutation.mutate()}
              >
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Existing Members List */}
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Current Members ({workspace.members.length})
          </h4>
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {workspace.members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between p-3 text-xs">
                <div>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">{m.name}</p>
                  <p className="text-zinc-400">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={m.role}
                    onChange={(e) => changeRoleMutation.mutate({ userId: m.userId, role: e.target.value as Role })}
                    className="h-7 py-0 text-xs w-24"
                  >
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </Select>

                  <IconButton
                    label="Remove member"
                    className="text-rose-600 hover:bg-rose-500/10"
                    onClick={() => removeMemberMutation.mutate(m.userId)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function EditProductModal({
  product,
  workspaces,
  onClose
}: {
  product: AdminProduct;
  workspaces: AdminWorkspace[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();

  const [form, setForm] = useState({
    name: product.name,
    category: product.category,
    stage: product.stage,
    targetPrice: product.targetSellingPrice !== null ? String(product.targetSellingPrice) : '',
    workspaceId: product.workspaceId
  });

  const mutation = useMutation({
    mutationFn: () =>
      patch(`/admin/products/${product.id}`, {
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        stage: form.stage,
        targetSellingPrice: form.targetPrice ? Number(form.targetPrice) : null,
        workspaceId: form.workspaceId !== product.workspaceId ? form.workspaceId : undefined
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      qc.invalidateQueries({ queryKey: ['admin-overview'] });
      toast.success('Product updated successfully');
      onClose();
    },
    onError: (err) => toast.error((err as Error).message)
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  return (
    <Modal
      title={`Edit Product: ${product.name}`}
      subtitle={`ID: ${product.id.slice(0, 8)}…`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={mutation.isPending} onClick={handleSubmit}>
            Save Changes
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Product Name" htmlFor="prod-name">
          <Input
            id="prod-name"
            required
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>

        <Field label="Category" htmlFor="prod-category">
          <Input
            id="prod-category"
            placeholder="Electronics, Apparel, etc."
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          />
        </Field>

        <Field label="PDLC Stage" htmlFor="prod-stage">
          <Select
            id="prod-stage"
            value={form.stage}
            onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value as StageId }))}
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Target Selling Price" htmlFor="prod-price">
          <Input
            id="prod-price"
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 49.99"
            value={form.targetPrice}
            onChange={(e) => setForm((f) => ({ ...f, targetPrice: e.target.value }))}
          />
        </Field>

        <Field label="Assigned Organization" htmlFor="prod-ws">
          <Select
            id="prod-ws"
            value={form.workspaceId}
            onChange={(e) => setForm((f) => ({ ...f, workspaceId: e.target.value }))}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
        </Field>
      </form>
    </Modal>
  );
}
