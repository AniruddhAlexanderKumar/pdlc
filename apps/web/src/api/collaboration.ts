import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AnswerValue,
  ActivityComment,
  ActivityRecord,
  ActivityStatus,
  Journey,
  Notification,
  NotificationPreference,
  Recommendation,
  ReviewState,
  Product,
  WithXp,
  TeamContribution
} from '@sv/shared';
import { ApiError, del, get, patch, post } from './client';
import { useXpMutation } from './hooks';
import { useToast } from '../components/Toast';

/**
 * Client hooks for activity collaboration.
 *
 * These never decide completion: the server returns the authoritative product
 * after each mutation, and `stageQuest()` remains the judge.
 */

export interface CollaborationView {
  journey: Journey;
  trail: import('@sv/shared').Trail;
  records: Record<string, ActivityRecord>;
  dependencies: Record<string, string[]>;
  commentCounts: Record<string, number>;
  team: TeamContribution[];
  /** Ranked by the server; the first entry is the recommended next action. */
  recommendations: Recommendation[];
}

export const collabKeys = {
  view: (productId: string) => ['collaboration', productId] as const,
  comments: (productId: string, key: string) => ['comments', productId, key] as const,
  team: (productId: string) => ['team', productId] as const,
  notifications: ['notifications'] as const,
  preferences: ['notification-preferences'] as const
};

export function useCollaboration(productId: string) {
  return useQuery({
    queryKey: collabKeys.view(productId),
    queryFn: () => get<CollaborationView>(`/products/${productId}/activities`),
    enabled: Boolean(productId),
    // Keep the journey feeling live for a team working in parallel.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true
  });
}

function useInvalidate(productId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: collabKeys.view(productId) });
    qc.invalidateQueries({ queryKey: ['workspace-data'] });
    qc.invalidateQueries({ queryKey: ['game'] });
    qc.invalidateQueries({ queryKey: ['leaderboard'] });
    qc.invalidateQueries({ queryKey: collabKeys.notifications });
    qc.invalidateQueries({ queryKey: collabKeys.team(productId) });
  };
}

/** Shared error handling: the server's message is always specific and useful. */
function useAction<TVars>(productId: string, fn: (vars: TVars) => Promise<unknown>) {
  const toast = useToast();
  const invalidate = useInvalidate(productId);
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidate(),
    onError: (e) => { if (e instanceof ApiError && e.status === 409) invalidate(); toast.error(e instanceof Error ? e.message : 'Something went wrong'); }
  });
}

export function useAssignActivity(productId: string) {
  return useAction(productId, ({ key, assigneeId }: { key: string; assigneeId: string | null }) =>
    patch(`/products/${productId}/activities/${encodeURIComponent(key)}/assignee`, { assigneeId })
  );
}

export function useActivityStatus(productId: string) {
  const refresh = useInvalidate(productId);
  return useXpMutation(
    ({ key, status }: { key: string; status: ActivityStatus }) =>
      patch<WithXp<Product>>(`/products/${productId}/activities/${encodeURIComponent(key)}/status`, { status }),
    refresh
  );
}

export function useSubmitReview(productId: string) {
  return useAction(productId, ({ key }: { key: string }) =>
    post(`/products/${productId}/activities/${encodeURIComponent(key)}/submit-review`)
  );
}

export function useReviewActivity(productId: string) {
  const refresh = useInvalidate(productId);
  return useXpMutation(
    ({
      key,
      decision,
      note,
      expectedAnswer
    }: {
      expectedAnswer?: AnswerValue;
      key: string;
      decision: 'approve' | 'request_changes';
      note?: string;
    }) =>
      post<WithXp<Product>>(`/products/${productId}/activities/${encodeURIComponent(key)}/review`, {
        decision,
        note,
        expectedAnswer
      }),
    refresh
  );
}

export function useAddDependency(productId: string) {
  return useAction(productId, ({ key, dependsOnKey }: { key: string; dependsOnKey: string }) =>
    post(`/products/${productId}/activities/${encodeURIComponent(key)}/dependencies`, { dependsOnKey })
  );
}

export function useRemoveDependency(productId: string) {
  return useAction(productId, ({ key, dependsOnKey }: { key: string; dependsOnKey: string }) =>
    del(`/products/${productId}/activities/${encodeURIComponent(key)}/dependencies/${encodeURIComponent(dependsOnKey)}`)
  );
}

export function useComments(productId: string, key: string | null) {
  return useQuery({
    queryKey: collabKeys.comments(productId, key ?? ''),
    queryFn: () => get<ActivityComment[]>(`/products/${productId}/activities/${encodeURIComponent(key!)}/comments`),
    enabled: Boolean(productId && key)
  });
}

export function useAddComment(productId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ key, body }: { key: string; body: string }) =>
      post<ActivityComment>(`/products/${productId}/activities/${encodeURIComponent(key)}/comments`, { body }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: collabKeys.comments(productId, vars.key) });
      qc.invalidateQueries({ queryKey: collabKeys.view(productId) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add the comment')
  });
}

export function useTeam(productId: string) {
  return useQuery({
    queryKey: collabKeys.team(productId),
    queryFn: () => get<TeamContribution[]>(`/products/${productId}/team`),
    enabled: Boolean(productId)
  });
}

// ── Notifications ─────────────────────────────────────────────────────────

export interface NotificationFeed {
  unread: number;
  notifications: Notification[];
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: collabKeys.notifications,
    queryFn: () => get<NotificationFeed>('/notifications'),
    enabled,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => post('/notifications/read', ids ? { ids } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: collabKeys.notifications })
  });
}

export function useNotificationPreferences() {
  return useQuery({
    queryKey: collabKeys.preferences,
    queryFn: () => get<NotificationPreference>('/notifications/preferences')
  });
}

export function useSaveNotificationPreferences() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (prefs: Partial<NotificationPreference>) => patch<NotificationPreference>('/notifications/preferences', prefs),
    onSuccess: () => qc.invalidateQueries({ queryKey: collabKeys.preferences }),
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not save preferences')
  });
}

export type { ActivityStatus, ReviewState };
