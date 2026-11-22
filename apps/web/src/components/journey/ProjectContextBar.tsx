import { Link } from 'react-router';
import { FolderKanban, Route } from 'lucide-react';
import { useSession } from '../../api/hooks';
import { useProjectParam } from '../../lib/useProjectParam';
import { ProjectSelector } from './ProjectSelector';

/**
 * The project context strip shown in Design Studio. It reads and writes the
 * shared selected project (via ?project=), so choosing a project here also
 * changes what Journey and the AI Assistant consider current.
 */
export function ProjectContextBar({ note }: { note?: string }) {
  const me = useSession();
  const [selectedId, select] = useProjectParam(me.workspace.id);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-500">
        <FolderKanban className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
        Project context
      </span>
      <ProjectSelector selectedId={selectedId} onSelect={select} compact />
      {selectedId && (
        <Link
          to={`/?project=${selectedId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
        >
          <Route className="h-3.5 w-3.5" aria-hidden="true" /> Open Journey
        </Link>
      )}
      {note && <span className="text-xs text-zinc-500">{note}</span>}
      {!selectedId && <span className="text-xs text-zinc-500">Select a project so designs stay attached to its Journey.</span>}
    </div>
  );
}
