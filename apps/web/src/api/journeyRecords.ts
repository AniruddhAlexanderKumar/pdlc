import { useQuery } from '@tanstack/react-query';
import { get } from './client';

export type FileVersion = { id: string; filename: string };
export type ProjectDesign = { id: string; kind: 'diagram' | 'sketch' | 'model'; label: string; revision: number };
export type WorkRecord = {
  id: string;
  activityId: string;
  kind: 'note' | 'requirement' | 'part' | 'test' | 'change' | 'file' | 'diagram' | 'sketch' | 'model' | 'model' | 'release';
  label: string;
  data: Record<string, unknown>;
  versions: FileVersion[];
};
export type ReleaseContents = {
  designs: ProjectDesign[];
  records: (Pick<WorkRecord, 'id' | 'kind' | 'label' | 'data'> & { version: FileVersion | null })[];
  token: string;
};

export const recordsPath = (projectId: string) => `/journeys/projects/${projectId}/records`;
export const recordsKey = (projectId: string) => ['journey-records', projectId];

export function useJourneyRecords(projectId: string | null) {
  return useQuery({
    queryKey: recordsKey(projectId ?? ''),
    queryFn: () => get<{ records: WorkRecord[]; designs: ProjectDesign[] }>(recordsPath(projectId!)),
    enabled: Boolean(projectId)
  });
}

export async function uploadJourneyFile(projectId: string, activityId: string, file: File, recordId?: string) {
  if (!file.size) throw new Error('Choose a non-empty file');
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file up to 10 MB');
  const query = new URLSearchParams({ filename: file.name });
  if (recordId) query.set('recordId', recordId);
  const response = await fetch(`/api${recordsPath(projectId)}/files/${activityId}?${query}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: file
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? 'Could not save the file');
  }
}
