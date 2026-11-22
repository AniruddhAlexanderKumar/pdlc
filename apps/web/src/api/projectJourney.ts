import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProjectJourneyView } from '@sv/shared';
import { del, get, patch, post } from './client';

/**
 * Journey API hooks. Every mutation invalidates the project's journey view so
 * the path, progress and next action update immediately.
 */

export const journeyKeys = {
  all: ['project-journey'] as const,
  project: (projectId: string) => ['project-journey', projectId] as const,
  members: (projectId: string) => ['project-journey-members', projectId] as const
};

export function useProjectJourney(projectId: string | null) {
  return useQuery({
    queryKey: journeyKeys.project(projectId ?? 'none'),
    queryFn: () => get<ProjectJourneyView>(`/journeys/projects/${projectId}`),
    enabled: Boolean(projectId),
    staleTime: 10_000
  });
}

export function useJourneyMembers(projectId: string | null) {
  return useQuery({
    queryKey: journeyKeys.members(projectId ?? 'none'),
    queryFn: () => get<{ id: string; name: string }[]>(`/journeys/projects/${projectId}/members`),
    enabled: Boolean(projectId)
  });
}

function useInvalidateJourney(projectId: string | null) {
  const qc = useQueryClient();
  return () => {
    if (projectId) void qc.invalidateQueries({ queryKey: journeyKeys.project(projectId) });
    void qc.invalidateQueries({ queryKey: ['projects'] });
    void qc.invalidateQueries({ queryKey: ['project-issues'] });
  };
}

export function useCreateStage(projectId: string | null) {
  const refresh = useInvalidateJourney(projectId);
  return useMutation({
    mutationFn: (body: { name: string; description: string }) => post(`/journeys/projects/${projectId}/stages`, body),
    onSuccess: refresh
  });
}

export function useUpdateStage(projectId: string | null) {
  const refresh = useInvalidateJourney(projectId);
  return useMutation({
    mutationFn: ({ stageId, ...body }: { stageId: string; name?: string; description?: string }) =>
      patch(`/journeys/stages/${stageId}`, body),
    onSuccess: refresh
  });
}

export function useCreateActivity(projectId: string | null) {
  const refresh = useInvalidateJourney(projectId);
  return useMutation({
    mutationFn: (body: {
      stageId: string;
      kind: string;
      title: string;
      description?: string;
      priority?: string;
      assigneeId?: string | null;
      dueAt?: string | null;
    }) => post(`/journeys/projects/${projectId}/activities`, body),
    onSuccess: refresh
  });
}

export function useUpdateActivity(projectId: string | null) {
  const refresh = useInvalidateJourney(projectId);
  return useMutation({
    mutationFn: ({ activityId, ...body }: { activityId: string; [key: string]: unknown }) =>
      patch(`/journeys/activities/${activityId}`, body),
    onSuccess: refresh
  });
}

export function useDeleteActivity(projectId: string | null) {
  const refresh = useInvalidateJourney(projectId);
  return useMutation({
    mutationFn: (activityId: string) => del(`/journeys/activities/${activityId}`),
    onSuccess: refresh
  });
}

export function useActivityReview(projectId: string | null) {
  const refresh = useInvalidateJourney(projectId);
  return useMutation({
    mutationFn: ({ activityId, action, note }: { activityId: string; action: 'request' | 'approve' | 'changes'; note?: string }) =>
      post(`/journeys/activities/${activityId}/review`, { action, note: note ?? '' }),
    onSuccess: refresh
  });
}

export function useActivityDependency(projectId: string | null) {
  const refresh = useInvalidateJourney(projectId);
  return useMutation({
    mutationFn: ({ activityId, dependsOnId }: { activityId: string; dependsOnId: string }) =>
      post(`/journeys/activities/${activityId}/dependencies`, { dependsOnId }),
    onSuccess: refresh
  });
}

export function useRemoveDependency(projectId: string | null) {
  const refresh = useInvalidateJourney(projectId);
  return useMutation({
    mutationFn: ({ activityId, dependsOnId }: { activityId: string; dependsOnId: string }) =>
      del(`/journeys/activities/${activityId}/dependencies/${dependsOnId}`),
    onSuccess: refresh
  });
}

export function useLinkArtifact(projectId: string | null) {
  const refresh = useInvalidateJourney(projectId);
  return useMutation({
    mutationFn: ({ activityId, artifactType, artifactId }: { activityId: string; artifactType: 'diagram' | 'sketch'; artifactId: string }) =>
      post(`/journeys/activities/${activityId}/link`, { artifactType, artifactId }),
    onSuccess: refresh
  });
}
