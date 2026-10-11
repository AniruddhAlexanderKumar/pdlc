import React, { useState, useEffect } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

interface TasksViewProps {
  projectId: string;
}

export const TasksView: React.FC<TasksViewProps> = ({ projectId }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [submitting, setSubmitting] = useState(false);

  const loadTasks = async () => {
    try {
      const data = await api.getTasks(projectId);
      setTasks(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadTasks();
  }, [projectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createTask({
        projectId,
        title,
        description,
        priority,
      });
      setIsCreateOpen(false);
      setTitle('');
      setDescription('');
      await loadTasks();
    } catch (err: any) {
      alert(`Error creating task: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'Completed' ? 'Open' : 'Completed';
    try {
      await api.updateTask(taskId, { status: nextStatus });
      await loadTasks();
    } catch (err: any) {
      alert(`Error updating task: ${err.message}`);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Engineering Tasks & Action Items"
        subtitle="Cross-functional task queue originating from reviews, findings, nonconformances, and changes."
        icon="[TSK]"
        color="text-brand"
        actions={
          <button
            onClick={() => setIsCreateOpen(true)}
            className="bg-brand text-black hover:bg-brand-hover text-xs font-mono font-bold px-3 py-1.5 transition-colors"
          >
            + NEW ACTION ITEM
          </button>
        }
      />

      <div className="flex-1 glass-panel p-6 rounded-xl overflow-y-auto space-y-3">
        <div className="font-mono text-xs text-brand mb-2 border-b border-surface-800 pb-2">
          Action Queue ({tasks.length})
        </div>

        {tasks.map((task) => (
          <div
            key={task.id}
            className="p-4 bg-surface-900 border border-surface-800 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={task.status === 'Completed'}
                onChange={() => handleToggleStatus(task.id, task.status)}
                className="mt-1 w-4 h-4 rounded bg-surface-800 border-surface-700 cursor-pointer"
              />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-white">{task.id}</span>
                  <StatusBadge status={task.priority} />
                  <StatusBadge status={task.status} />
                  {task.sourceObjectType && (
                    <span className="text-[10px] font-mono text-surface-500">
                      From: {task.sourceObjectType} ({task.sourceObjectId})
                    </span>
                  )}
                </div>
                <div
                  className={`text-sm font-medium ${
                    task.status === 'Completed' ? 'line-through text-surface-500' : 'text-white'
                  }`}
                >
                  {task.title}
                </div>
                {task.description && (
                  <div className="text-xs text-surface-400 mt-0.5">{task.description}</div>
                )}
                <div className="text-[10px] text-surface-500 font-mono mt-1">
                  Assignee: {task.assigneeId}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-brand/40 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              Create Engineering Action Item
            </h3>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Action Title
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Conduct thermal analysis on rewound motor"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Critical">Critical</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Description / Expected Outcome
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-surface-800">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-3 py-1.5 text-xs font-mono text-surface-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-brand text-black hover:bg-brand-hover text-xs font-mono font-bold px-4 py-2"
              >
                {submitting ? 'Creating...' : 'Create Action Item'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
