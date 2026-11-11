import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppLayoutSettings,
  DashboardLayout,
  DashboardSettings,
  Insight,
  Invite,
  LeaderboardEntry,
  Material,
  Me,
  Member,
  PlayerStats,
  Product,
  Supplier,
  VoiceImportPayload,
  VoiceImportResult,
  VoiceProcessResult,
  WithXp,
  WorkspaceData,
  WorkspaceProfile
} from '@sv/shared';
import { ApiError, del, get, patch, post, put, uploadAudio } from './client';
import { useCelebrate } from '../components/Celebrate';
import { useToast } from '../components/Toast';

export const keys = {
  me: ['me'] as const,
  data: ['workspace-data'] as const,
  game: ['game'] as const,
  dashboard: ['dashboard'] as const,
  leaderboard: ['leaderboard'] as const,
  members: ['members'] as const,
  invites: ['invites'] as const,
  insights: (id: string) => ['insights', id] as const
};

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

export function useWorkspaceProfile() {
  const me = useSession();
  return useQuery({
    queryKey: ['workspace-profile', me.workspace.id],
    queryFn: () => get<WorkspaceProfile>(`/workspace/profile?workspaceId=${encodeURIComponent(me.workspace.id)}`),
    enabled: !me.demo
  });
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
  const { user } = useSession();
  return useQuery({ queryKey: [...keys.dashboard, user.id], queryFn: () => get<DashboardLayout>('/dashboard') });
}

/** Saves an account-scoped layout and refreshes every dashboard consumer. */
export function useSaveDashboardLayout() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useSession();
  return useMutation({
    mutationFn: (settings: DashboardSettings) => put<DashboardLayout>('/dashboard', settings),
    onSuccess: (layout) => {
      if (qc.getQueryData<Me>(keys.me)?.user.id !== user.id) return;
      qc.setQueryData([...keys.dashboard, user.id], layout);
      toast.success('Dashboard saved');
    },
    onError: (e) => { if (qc.getQueryData<Me>(keys.me)?.user.id === user.id) toast.error(e instanceof Error ? e.message : 'Could not save your dashboard'); }
  });
}

export function useAppLayout() {
  const { user } = useSession();
  return useQuery({ queryKey: ['app-layout', user.id], queryFn: () => get<AppLayoutSettings>('/dashboard/app-layout') });
}

export function useSaveAppLayout() {
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useSession();
  return useMutation({
    mutationFn: (settings: AppLayoutSettings) => put<AppLayoutSettings>('/dashboard/app-layout', settings),
    onSuccess: (settings) => {
      if (qc.getQueryData<Me>(keys.me)?.user.id !== user.id) return;
      qc.setQueryData(['app-layout', user.id], settings);
      toast.success('Application layout saved');
    },
    onError: (e) => {
      if (qc.getQueryData<Me>(keys.me)?.user.id === user.id) toast.error(e instanceof Error ? e.message : 'Could not save application layout');
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
  const qc = useQueryClient();
  return useXpMutation(({ id, ...body }: TaskInput & { id: string }) => patch<WithXp<Product>>(`/products/${productId}/tasks/${id}`, body), product => { setProduct(product); qc.invalidateQueries({ queryKey: ['project-issues'] }); qc.invalidateQueries({ queryKey: ['projects'] }); });
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

// ── Hands-Free Voice AI Onboarding ─────────────────────────────────────────

export function useProcessVoice() {
  const toast = useToast();
  return useMutation({
    mutationFn: (transcript: string) => post<VoiceProcessResult>('/voice/process', { transcript }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to analyze transcript')
  });
}

export function useProcessVoiceAudio() {
  const toast = useToast();
  return useMutation({
    mutationFn: (audioBlob: Blob) => uploadAudio<VoiceProcessResult>('/voice/process-audio', audioBlob),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Server audio processing failed')
  });
}

export function useImportVoice() {
  const qc = useQueryClient();
  const setProduct = useSetProduct();
  return useXpMutation(
    (input: { requestId: string; draft: VoiceImportPayload }) => post<WithXp<VoiceImportResult>>('/voice/import', input),
    (result) => {
      setProduct(result.product);
      qc.invalidateQueries({ queryKey: keys.data });
      qc.invalidateQueries({ queryKey: ['projects'] });
    }
  );
}
