import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JourneyRecordsView, JourneyV2, Lesson } from '@sv/shared';
import { get, post, put } from './client';

/**
 * The gamified journey API.
 *
 * State always comes from the server: the map renders what the database says,
 * never a local guess. Mutations return the fresh journey in the same response,
 * so a lesson completion updates the map without a second round trip.
 */

export interface JourneySnapshot {
  journey: JourneyV2;
  records: JourneyRecordsView;
  stage: string;
}

export interface LessonView {
  lesson: Lesson;
  state: JourneyV2['worlds'][number]['units'][number]['lessons'][number];
  product: { id: string; name: string; description: string; category: string };
  checkedItems: string[];
  journey: JourneyV2;
}

export interface LessonResult {
  lessonId: string;
  evidence: string;
  xpAwarded: number;
  journey: JourneyV2;
  records: JourneyRecordsView;
  nextLessonId: string | null;
  xp: { points: number; label: string }[];
}

export interface CheckpointResult {
  checkpointId: string;
  passed: boolean;
  unmet: { id: string; label: string; observed: string }[];
  xpAwarded: number;
  journey: JourneyV2;
  records: JourneyRecordsView;
  xp: { points: number; label: string }[];
}

export const journeyKeys = {
  all: ['journey'] as const,
  product: (id: string) => [...journeyKeys.all, id] as const,
  lesson: (id: string, lessonId: string) => [...journeyKeys.all, id, 'lesson', lessonId] as const
};

export function useJourney(productId: string) {
  return useQuery({
    queryKey: journeyKeys.product(productId),
    queryFn: () => get<JourneySnapshot>(`/products/${productId}/journey`),
    enabled: Boolean(productId),
    staleTime: 15_000
  });
}

export function useLesson(productId: string, lessonId: string) {
  return useQuery({
    queryKey: journeyKeys.lesson(productId, lessonId),
    queryFn: () => get<LessonView>(`/products/${productId}/journey/lessons/${lessonId}`),
    enabled: Boolean(productId && lessonId)
  });
}

/** Ticks one checklist item. Returns the refreshed journey. */
export function useChecklistItem(productId: string, lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { itemId: string; checked: boolean }) =>
      put<{ journey: JourneyV2; records: JourneyRecordsView }>(
        `/products/${productId}/journey/lessons/${lessonId}/checklist/${vars.itemId}`,
        { checked: vars.checked }
      ),
    onSuccess: (data) => {
      qc.setQueryData(journeyKeys.product(productId), (old: JourneySnapshot | undefined) =>
        old ? { ...old, journey: data.journey, records: data.records } : old
      );
      void qc.invalidateQueries({ queryKey: journeyKeys.lesson(productId, lessonId) });
    }
  });
}

export function useCompleteLesson(productId: string, lessonId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { text?: string; optionId?: string; fields?: Record<string, string>; order?: string[] }) =>
      post<LessonResult>(`/products/${productId}/journey/lessons/${lessonId}/complete`, body),
    onSuccess: (data) => {
      qc.setQueryData(journeyKeys.product(productId), (old: JourneySnapshot | undefined) =>
        old ? { ...old, journey: data.journey, records: data.records } : old
      );
      void qc.invalidateQueries({ queryKey: journeyKeys.lesson(productId, lessonId) });
      // The completion can unlock the next lesson, so refresh every view of this product's journey.
      void qc.invalidateQueries({ queryKey: journeyKeys.product(productId) });
    }
  });
}

export function useSubmitCheckpoint(productId: string, checkpointId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => post<CheckpointResult>(`/products/${productId}/journey/checkpoints/${checkpointId}/submit`, {}),
    onSuccess: (data) => {
      qc.setQueryData(journeyKeys.product(productId), (old: JourneySnapshot | undefined) =>
        old ? { ...old, journey: data.journey, records: data.records } : old
      );
    }
  });
}
