import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronsUpDown, FolderKanban, Plus } from 'lucide-react';
import type { Project } from '@sv/shared';
import { get } from '../../api/client';
import { useSession } from '../../api/hooks';
import { cx } from '../ui';

/**
 * Project switcher for the Journey-first workspace. Picking a project updates
 * the shared selected-project context, which Journey, Design Studio and the
 * AI Assistant all read — switching here changes context everywhere.
 */
export function ProjectSelector({
  selectedId,
  onSelect,
  onCreate,
  compact = false
}: {
  selectedId: string | null;
  onSelect: (projectId: string) => void;
  onCreate?: () => void;
  compact?: boolean;
}) {
  const me = useSession();
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => get<Project[]>('/projects') });
  const selected = projects.data?.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const canCreate = me.workspace.role === 'owner' || me.workspace.role === 'admin';

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select project"
        onClick={() => setOpen((value) => !value)}
        className={cx(
          'flex min-h-10 items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 text-left text-sm font-medium shadow-sm hover:border-blue-300 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-blue-700',
          compact ? 'max-w-[13rem]' : 'min-w-[14rem] justify-between'
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <FolderKanban className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <span className="truncate">
            {projects.isLoading
              ? 'Loading projects…'
              : selected
                ? `${selected.key} · ${selected.name}`
                : 'Select a project'}
          </span>
        </span>
        {!compact && <ChevronsUpDown className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="listbox"
            aria-label="Projects"
            className="animate-rise absolute left-0 top-full z-40 mt-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            {projects.isError && <p className="px-3 py-2 text-xs text-rose-600">Could not load projects.</p>}
            {projects.data?.length === 0 && (
              <p className="px-3 py-2 text-xs text-zinc-500">No projects yet. Create one to start a Journey.</p>
            )}
            {projects.data?.map((project) => (
              <button
                key={project.id}
                role="option"
                aria-selected={project.id === selectedId}
                onClick={() => {
                  setOpen(false);
                  onSelect(project.id);
                }}
                className={cx(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800',
                  project.id === selectedId && 'bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{project.name}</span>
                  <span className="block text-xs text-zinc-500">{project.key}</span>
                </span>
                {project.id === selectedId && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              </button>
            ))}
            {onCreate && canCreate && (
              <>
                <div className="my-1.5 border-t border-zinc-100 dark:border-zinc-800" />
                <button
                  onClick={() => {
                    setOpen(false);
                    onCreate();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-950"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> New project
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
