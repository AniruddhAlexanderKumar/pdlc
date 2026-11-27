import { useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { setSelectedProjectId, useSelectedProjectId } from './projectContext';

/**
 * Keeps the `?project=` query parameter, the shared selected-project context
 * and a consumer (Assistant, Design Studio) in step. Deep links such as
 * `/assistant?project=…` or `/designs?project=…` adopt the project; picking a
 * project in the UI updates both the URL and the shared context.
 */
export function useProjectParam(workspaceId: string): [string | null, (projectId: string) => void] {
  const [params, setParams] = useSearchParams();
  const param = params.get('project');
  const contextId = useSelectedProjectId(workspaceId);

  useEffect(() => {
    if (param && param !== contextId) setSelectedProjectId(workspaceId, param);
  }, [param, contextId, workspaceId]);

  const selected = param ?? contextId;
  const select = (projectId: string) => {
    setParams(
      (next) => {
        const updated = new URLSearchParams(next);
        if (updated.get('project') !== projectId) {
          updated.delete('step');
          if (updated.has('project')) updated.delete('editor');
        }
        updated.set('project', projectId);
        return updated;
      },
      { replace: true }
    );
  };
  return [selected, select];
}
