import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { resolveLayout } from '@sv/shared';
import type { ContributionRatings } from '@sv/shared';
import type {
  DashboardLayout,
  Contribution,
  ContributionCategory,
  ContributionRubricConfig,
  ContributionSummary,
  Insight,
  Invite,
  LeaderboardEntry,
  Material,
  Me,
  Member,
  PlayerStats,
  PresetId,
  Product,
  Supplier,
  WithXp,
  WorkspaceData
} from '@sv/shared';
import { ApiError, del, get, patch, post, put } from './client';
import { useCelebrate } from '../components/Celebrate';
import { useToast } from '../components/Toast';

export const keys = {
  me: ['me'] as const,
  data: ['workspace-data'] as const,
  game: ['game'] as const,
  dashboard: ['dashboard'] as const,
  contributions: ['contributions'] as const,
  leaderboard: ['leaderboard'] as const,
  members: ['members'] as const,
  invites: ['invites'] as const,
  insights: (id: string) => ['insights', id] as const
};

export interface ContributionSubmissionInput {
  idempotencyKey: string;
  categoryKey: string;
  title: string;
  description: string;
  outcome: string;
  expectedImpact: string;
  projectId?: string | null;
  issueId?: string | null;
  taskId?: string | null;
  productId?: string | null;
  participants: {
    userId: string;
    roleDescription: string;
    contributionDescription: string;
    attributionShare: number;
  }[];
  evidence: {
    sourceType: 'url' | 'description' | 'project' | 'issue' | 'task' | 'product';
    url?: string | null;
    description: string;
    participantId?: string | null;
    projectId?: string | null;
    issueId?: string | null;
    taskId?: string | null;
    productId?: string | null;
  }[];
}

function useContributionMutation<TInput>(send: (input: TInput) => Promise<Contribution>) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: send,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.contributions });
      qc.invalidateQueries({ queryKey: keys.game });
      toast.success('Contribution record updated');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Could not save contribution')
  });
}

export function useContributionCategories() {
  return useQuery({ queryKey: [...keys.contributions, 'categories'], queryFn: () => get<ContributionCategory[]>('/contributions/categories') });
}

export function useContributionRubric() {
  return useQuery({ queryKey: [...keys.contributions, 'rubric'], queryFn: () => get<ContributionRubricConfig>('/contributions/rubric') });
}

export function useContributionSummary(days: number, enabled = true) {
  return useQuery({
    queryKey: [...keys.contributions, 'summary', days],
    queryFn: () => get<ContributionSummary>(`/contributions/summary?days=${days}`),
    enabled
  });
}

export function useContributions() {
  return useQuery({ queryKey: [...keys.contributions, 'mine'], queryFn: () => get<Contribution[]>('/contributions?limit=100') });
}

export function useManagementContributions(
  params: { userId?: string; projectId?: string; category?: string; status?: string; from?: string; to?: string },
  enabled = true
) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  return useQuery({
    queryKey: [...keys.contributions, 'management', params],
    queryFn: () => get<Contribution[]>(`/contributions/management?${query.toString()}`),
    enabled
  });
}

export function useCreateContribution() {
  return useContributionMutation((input: ContributionSubmissionInput) => post<Contribution>('/contributions', input));
}

export function useEditContribution() {
  return useContributionMutation(({ id, ...input }: { id: string } & Partial<ContributionSubmissionInput>) =>
    patch<Contribution>(`/contributions/${id}`, input)
  );
}

export function useSubmitContribution() {
  return useContributionMutation((id: string) => post<Contribution>(`/contributions/${id}/submit`, {}));
}

export function useReviewContribution() {
  return useContributionMutation(({ id, ...body }: {
    id: string;
    decision: 'revision_requested' | 'approved' | 'rejected';
    notes: string;
    scores?: { userId: string; ratings: ContributionRatings; explanation: string }[];
  }) => post<Contribution>(`/contributions/${id}/review`, body));
}

export function useDisputeContribution() {
  return useContributionMutation(({ id, reason }: { id: string; reason: string }) => post<Contribution>(`/contributions/${id}/dispute`, { reason }));
}

export function useResolveContribution() {
  return useContributionMutation(({ id, ...body }: {
    id: string;
    decision: 'approved' | 'revision_requested' | 'rejected';
    notes: string;
    scores?: { userId: string; ratings: ContributionRatings; explanation: string }[];
  }) => post<Contribution>(`/contributions/${id}/resolve`, body));
}

export function useVerifyContributionEvidence() {
  return useContributionMutation(({ id, evidenceId }: { id: string; evidenceId: string }) =>
    post<Contribution>(`/contributions/${id}/evidence/${evidenceId}/verify`, {})
  );
}

/**
 * Swap the signed-in session (login, logout, workspace switch). Sets `me` first, then
 * resets every other query so nothing from the previous user or workspace lingers.
 * (queryClient.clear() would detach live observers, so the UI would never notice.)
 */
export function useResetSession() {
  const qc = useQueryClient();
  return (me: Me | null) => {
    qc.setQueryData(keys.me, me);
    const others = { predicate: (q: { queryKey: readonly unknown[] }) => q.queryKey[0] !== keys.me[0] };
    if (me) qc.resetQueries(others);
    else qc.removeQueries(others);
  };
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: async () => {
      try {
        return await get<Me>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000
  });
}

/** Signed-in user context. Only use below the auth guard. */
export function useSession(): Me {
  const { data } = useMe();
  if (!data) throw new Error('useSession used outside an authenticated route');
  return data;
}

export function useWorkspaceData() {
  return useQuery({ queryKey: keys.data, queryFn: () => get<WorkspaceData>('/workspace/data') });
}

export function useGame() {
  return useQuery({ queryKey: keys.game, queryFn: () => get<PlayerStats>('/game/me') });
}

export function useLeaderboard() {
  return useQuery({ queryKey: keys.leaderboard, queryFn: () => get<LeaderboardEntry[]>('/game/leaderboard') });
}

export function useDashboardLayout() {
  return useQuery({ queryKey: keys.dashboard, queryFn: () => get<DashboardLayout>('/dashboard') });
}

/** Switches preset immediately and rolls back if the server rejects it. */
export function useSetDashboardPreset() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (preset: PresetId) => put<DashboardLayout>('/dashboard', { preset }),
    onMutate: async (preset) => {
      await qc.cancelQueries({ queryKey: keys.dashboard });
      const previous = qc.getQueryData<DashboardLayout>(keys.dashboard);
      qc.setQueryData<DashboardLayout>(keys.dashboard, resolveLayout({ preset }));
      return { previous };
    },
    onSuccess: (layout) => qc.setQueryData(keys.dashboard, layout),
    onError: (e, _preset, ctx) => {
      qc.setQueryData(keys.dashboard, ctx?.previous);
      toast.error(e instanceof Error ? e.message : 'Could not save your layout');
    }
  });
}

export function useInsights(productId: string) {
  return useQuery({ queryKey: keys.insights(productId), queryFn: () => get<Insight[]>(`/products/${productId}/insights`) });
}

export function useMembers() {
  return useQuery({ queryKey: keys.members, queryFn: () => get<Member[]>('/workspace/members') });
}

export function useInvites(enabled: boolean) {
  return useQuery({ queryKey: keys.invites, queryFn: () => get<Invite[]>('/workspace/invites'), enabled });
}

/**
 * Wraps a mutation that returns `{ data, xp }`: shows errors, celebrates XP,
 * and refreshes whatever the change affects.
 */
function useXpMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<WithXp<TData>>,
  onData?: (data: TData, vars: TVars) => void,
  opts: { refreshAll?: boolean } = {}
) {
  const qc = useQueryClient();
  const toast = useToast();
  const celebrate = useCelebrate();
  return useMutation({
    mutationFn: fn,
    onSuccess: (res, vars) => {
      onData?.(res.data, vars);
      if (opts.refreshAll) qc.invalidateQueries({ queryKey: keys.data });
      qc.invalidateQueries({ queryKey: ['insights'] });
      if (res.xp.length > 0) {
        celebrate(res.xp);
        qc.invalidateQueries({ queryKey: keys.game });
        qc.invalidateQueries({ queryKey: keys.leaderboard });
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Something went wrong')
  });
}

function useSetProduct() {
  const qc = useQueryClient();
  return (product: Product) =>
    qc.setQueryData<WorkspaceData>(keys.data, (old) => {
      if (!old) return old;
      const exists = old.products.some((p) => p.id === product.id);
      return {
        ...old,
        products: exists ? old.products.map((p) => (p.id === product.id ? product : p)) : [product, ...old.products]
      };
    });
}

// ── Products ───────────────────────────────────────────────────────────────

export type ProductPatch = Partial<Pick<Product, 'name' | 'category' | 'description' | 'imageUrl' | 'notes' | 'targetSellingPrice' | 'stage'>> & {
  costs?: Partial<Product['costs']>;
};

export function useCreateProduct() {
  const setProduct = useSetProduct();
  return useXpMutation((body: ProductPatch) => post<WithXp<Product>>('/products', body), setProduct);
}

export function useUpdateProduct(productId: string) {
  const setProduct = useSetProduct();
  return useXpMutation((body: ProductPatch) => patch<WithXp<Product>>(`/products/${productId}`, body), setProduct);
}

/** For the board, where the product changes per call. */
export function useMoveStage() {
  const setProduct = useSetProduct();
  return useXpMutation(({ id, stage }: { id: string; stage: Product['stage'] }) => patch<WithXp<Product>>(`/products/${id}`, { stage }), setProduct);
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => del<void>(`/products/${id}`),
    onSuccess: (_r, id) => {
      qc.setQueryData<WorkspaceData>(keys.data, (old) => old && { ...old, products: old.products.filter((p) => p.id !== id) });
    },
    onError: (e) => toast.error(e.message)
  });
}

export function useAnswer(productId: string) {
  const setProduct = useSetProduct();
  return useXpMutation(
    ({ key, value }: { key: string; value: unknown }) => put<WithXp<Product>>(`/products/${productId}/answers/${encodeURIComponent(key)}`, { value }),
    setProduct
  );
}

export function useSetBomLine(productId: string) {
  const setProduct = useSetProduct();
  return useXpMutation(
    ({ materialId, quantity }: { materialId: string; quantity: number }) => put<WithXp<Product>>(`/products/${productId}/materials/${materialId}`, { quantity }),
    setProduct
  );
}

export function useRemoveBomLine(productId: string) {
  const setProduct = useSetProduct();
  return useXpMutation((materialId: string) => del<WithXp<Product>>(`/products/${productId}/materials/${materialId}`), setProduct);
}

export interface TaskInput {
  title?: string;
  description?: string;
  status?: 'todo' | 'in_progress' | 'done';
  dueDate?: string | null;
  position?: number;
}

export function useCreateTask(productId: string) {
  const setProduct = useSetProduct();
  return useXpMutation((body: TaskInput) => post<WithXp<Product>>(`/products/${productId}/tasks`, body), setProduct);
}

export function useUpdateTask(productId: string) {
  const setProduct = useSetProduct();
  return useXpMutation(({ id, ...body }: TaskInput & { id: string }) => patch<WithXp<Product>>(`/products/${productId}/tasks/${id}`, body), setProduct);
}

export function useDeleteTask(productId: string) {
  const setProduct = useSetProduct();
  return useXpMutation((id: string) => del<WithXp<Product>>(`/products/${productId}/tasks/${id}`), setProduct);
}

export function useApplyInsight(productId: string) {
  const setProduct = useSetProduct();
  // A supplier switch changes a shared material price, so refresh everything.
  return useXpMutation((insightId: string) => post<WithXp<Product>>(`/products/${productId}/insights/apply`, { insightId }), setProduct, {
    refreshAll: true
  });
}

// ── Materials & suppliers ──────────────────────────────────────────────────

export type MaterialInput = Omit<Material, 'id'>;
export type SupplierInput = Omit<Supplier, 'id'> & { quotes?: { materialId: string; quotedPrice: number; moq: number | null }[] };

export function useSaveMaterial() {
  return useXpMutation(
    ({ id, ...body }: MaterialInput & { id?: string }) => (id ? patch<WithXp<Material>>(`/materials/${id}`, body) : post<WithXp<Material>>('/materials', body)),
    undefined,
    { refreshAll: true }
  );
}

export function useQuickPrice() {
  return useXpMutation(({ id, unitPrice }: { id: string; unitPrice: number }) => patch<WithXp<Material>>(`/materials/${id}`, { unitPrice }), undefined, {
    refreshAll: true
  });
}

export function useSaveSupplier() {
  return useXpMutation(
    ({ id, ...body }: SupplierInput & { id?: string }) => (id ? patch<WithXp<Supplier>>(`/suppliers/${id}`, body) : post<WithXp<Supplier>>('/suppliers', body)),
    undefined,
    { refreshAll: true }
  );
}

export function useDeleteEntity(kind: 'materials' | 'suppliers') {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (id: string) => del<void>(`/${kind}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.data });
      qc.invalidateQueries({ queryKey: ['insights'] });
    },
    onError: (e) => toast.error(e.message)
  });
}

export function useLoadSamples() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => post<WorkspaceData>('/workspace/sample-data'),
    onSuccess: (data) => {
      qc.setQueryData(keys.data, data);
      toast.success('Sample products added. Have a look around!');
    },
    onError: (e) => toast.error(e.message)
  });
}
