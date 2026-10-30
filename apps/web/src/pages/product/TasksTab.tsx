import { useState } from 'react';
import { Calendar, CheckCircle2, Circle, Edit3, Plus, Trash2 } from 'lucide-react';
import { XP, type Product, type Task, type TaskStatus } from '@sv/shared';
import { useCreateTask, useDeleteTask, useUpdateTask } from '../../api/hooks';
import { Button, cx, Field, IconButton, Input, Modal, ProgressBar, Select, Textarea } from '../../components/ui';

const COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: 'todo', label: 'To do' },
  { id: 'in_progress', label: 'In progress' },
  { id: 'done', label: 'Done' }
];

function TaskModal({ product, task, status, onClose }: { product: Product; task: Task | null; status: TaskStatus; onClose: () => void }) {
  const create = useCreateTask(product.id);
  const update = useUpdateTask(product.id);
  const [form, setForm] = useState({
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: task?.status ?? status,
    dueDate: task?.dueDate ?? ''
  });
  const submit = () => {
    const body = { title: form.title, description: form.description, status: form.status, dueDate: form.dueDate || null };
    if (task) update.mutate({ id: task.id, ...body }, { onSuccess: onClose });
    else create.mutate(body, { onSuccess: onClose });
  };
  return (
    <Modal
      title={task ? 'Edit task' : 'New task'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={create.isPending || update.isPending} disabled={!form.title.trim()}>
            {task ? 'Save' : 'Add task'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Title" htmlFor="t-title">
          <Input id="t-title" required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field label="Details" htmlFor="t-desc">
          <Textarea id="t-desc" rows={3} maxLength={4000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status" htmlFor="t-status">
            <Select id="t-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}>
              {COLUMNS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Due date" htmlFor="t-due">
            <Input id="t-due" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function TasksTab({ product }: { product: Product }) {
  const create = useCreateTask(product.id);
  const update = useUpdateTask(product.id);
  const remove = useDeleteTask(product.id);
  const [quick, setQuick] = useState('');
  const [modal, setModal] = useState<{ task: Task | null; status: TaskStatus } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const done = product.tasks.filter((t) => t.status === 'done').length;
  const pct = product.tasks.length ? Math.round((done / product.tasks.length) * 100) : 0;

  const drop = (status: TaskStatus) => {
    const t = product.tasks.find((x) => x.id === dragId);
    if (t && t.status !== status) update.mutate({ id: t.id, status });
    setDragId(null);
    setOver(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold">
            {done} of {product.tasks.length} done
          </p>
          <ProgressBar value={pct} className="mt-2 w-56" tone={pct === 100 ? 'emerald' : 'indigo'} />
          <p className="mt-1.5 text-xs text-zinc-500">Each completed task is worth +{XP.taskCompleted} XP.</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (quick.trim()) create.mutate({ title: quick.trim() }, { onSuccess: () => setQuick('') });
          }}
        >
          <Input aria-label="Quick add task" value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a task and press Enter" className="sm:w-72" maxLength={200} />
          <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} loading={create.isPending}>
            Add
          </Button>
        </form>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = product.tasks.filter((t) => t.status === col.id);
          return (
            <section
              key={col.id}
              aria-label={col.label}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(col.id);
              }}
              onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
              onDrop={() => drop(col.id)}
              className={cx('rounded-xl border bg-zinc-100/60 p-2 transition-colors dark:bg-zinc-900/40', over === col.id ? 'border-blue-400' : 'border-transparent')}
            >
              <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <span className="text-xs font-semibold">{col.label}</span>
                <span className="flex items-center gap-1">
                  <span className="text-[11px] tabular-nums text-zinc-400">{items.length}</span>
                  <IconButton label={`Add task to ${col.label}`} onClick={() => setModal({ task: null, status: col.id })}>
                    <Plus className="h-3.5 w-3.5" />
                  </IconButton>
                </span>
              </div>
              <div className="flex min-h-[90px] flex-col gap-2">
                {items.map((t) => {
                  const overdue = t.status !== 'done' && t.dueDate && t.dueDate < today;
                  return (
                    <article
                      key={t.id}
                      draggable
                      onDragStart={() => setDragId(t.id)}
                      className={cx(
                        'group rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900',
                        dragId === t.id && 'opacity-40'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          onClick={() => update.mutate({ id: t.id, status: t.status === 'done' ? 'todo' : 'done' })}
                          aria-label={t.status === 'done' ? 'Mark as not done' : 'Mark as done'}
                          className="mt-0.5 shrink-0"
                        >
                          {t.status === 'done' ? (
                            <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                          ) : (
                            <Circle className="h-4.5 w-4.5 text-zinc-300 hover:text-blue-500 dark:text-zinc-600" />
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className={cx('text-sm font-medium', t.status === 'done' && 'text-zinc-400 line-through')}>{t.title}</p>
                          {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">{t.description}</p>}
                          {t.dueDate && (
                            <p className={cx('mt-1.5 flex items-center gap-1 text-[11px]', overdue ? 'font-medium text-rose-600 dark:text-rose-400' : 'text-zinc-500')}>
                              <Calendar className="h-3 w-3" />
                              {overdue ? 'Overdue · ' : ''}
                              {new Date(t.dueDate + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </p>
                          )}
                        </div>
                        <div className="flex opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                          <IconButton label="Edit task" onClick={() => setModal({ task: t, status: t.status })}>
                            <Edit3 className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton label="Delete task" onClick={() => remove.mutate(t.id)} className="hover:text-rose-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </div>
                      <Select
                        aria-label="Move task"
                        className="mt-2 py-1 text-xs md:hidden"
                        value={t.status}
                        onChange={(e) => update.mutate({ id: t.id, status: e.target.value as TaskStatus })}
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </Select>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {modal && <TaskModal product={product} task={modal.task} status={modal.status} onClose={() => setModal(null)} />}
    </div>
  );
}
