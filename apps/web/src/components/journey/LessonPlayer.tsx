import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Lightbulb,
  Loader2,
  Lock,
  Sparkles,
  Star
} from 'lucide-react';
import type { Lesson, LessonProgress } from '@sv/shared';
import { useChecklistItem, useCompleteLesson, useLesson, type LessonView } from '../../api/journey';
import { Button, cx } from '../ui';

/**
 * The lesson player.
 *
 * A lesson is read → understood → done: intro and concept, a worked example,
 * then an activity the founder actually performs. The activity is the lesson:
 * it writes to the product and the server decides whether it is enough. Nothing
 * here marks a lesson complete locally.
 */
export function LessonPlayer({
  productId,
  lessonId,
  onClose,
  onNext,
  onUnlocked
}: {
  productId: string;
  lessonId: string;
  onClose: () => void;
  onNext: (nextLessonId: string | null) => void;
  onUnlocked?: (lessonId: string) => void;
}) {
  const query = useLesson(productId, lessonId);
  const complete = useCompleteLesson(productId, lessonId);

  const [text, setText] = useState('');
  const [optionId, setOptionId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ xp: number; nextLessonId: string | null } | null>(null);

  // Reset the activity when the founder moves to a different lesson.
  useEffect(() => {
    setText('');
    setOptionId(null);
    setFields({});
    setOrder([]);
    setShowHelp(false);
    setError(null);
    setDone(null);
  }, [lessonId]);

  const view = query.data;
  const lesson = view?.lesson;

  // Seed the priority ordering from the lesson definition.
  useEffect(() => {
    if (lesson?.activity.kind === 'priority' && order.length === 0) {
      setOrder((lesson.activity.priorities ?? []).map((p) => p.id));
    }
  }, [lesson, order.length]);

  if (query.isLoading) {
    return (
      <Shell onClose={onClose}>
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-zinc-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading lesson
        </div>
      </Shell>
    );
  }

  if (query.isError || !view || !lesson) {
    return (
      <Shell onClose={onClose}>
        <div role="alert" className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <p className="font-semibold">This lesson could not be opened.</p>
          <p className="mt-1">{(query.error as Error | undefined)?.message ?? 'Please try again.'}</p>
          <Button className="mt-3" variant="secondary" onClick={() => void query.refetch()}>Try again</Button>
        </div>
      </Shell>
    );
  }

  const state = view.state;
  const alreadyDone = state.state === 'completed';
  const kind = lesson.activity.kind;

  const canSubmit =
    kind === 'checklist'
      ? true
      : kind === 'write'
        ? text.trim().length >= (lesson.activity.minLength ?? 20)
        : kind === 'choice'
          ? Boolean(optionId)
          : kind === 'form'
            ? (lesson.activity.fields ?? []).filter((f) => f.required).every((f) => (fields[f.id] ?? '').trim().length > 0)
            : order.length === (lesson.activity.priorities ?? []).length;

  function submit() {
    setError(null);
    const body =
      kind === 'write'
        ? { text }
        : kind === 'choice'
          ? { optionId: optionId ?? undefined }
          : kind === 'form'
            ? { fields }
            : kind === 'priority'
              ? { order }
              : {};
    complete.mutate(body, {
      onSuccess: (result) => {
        const xp = result.xpAwarded > 0 ? result.xpAwarded : (result.xp ?? []).reduce((n, a) => n + a.points, 0);
        setDone({ xp, nextLessonId: result.nextLessonId });
        if (result.nextLessonId) onUnlocked?.(result.nextLessonId);
      },
      onError: (e) => setError((e as Error).message)
    });
  }

  return (
    <Shell onClose={onClose}>
      <div className="px-4 pb-28 pt-4 sm:px-6">
        {/* Breadcrumb: which world and unit this belongs to */}
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700 dark:text-blue-400">
          {worldLabel(view, lessonId)}
        </p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50 sm:text-2xl">{lesson.title}</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-zinc-400">{lesson.summary}</p>

        {/* Concept */}
        <section className="mt-5">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            <BookOpen className="h-3.5 w-3.5" /> The idea
          </h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-zinc-300">{lesson.concept}</p>
        </section>

        {/* Worked example */}
        <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/40">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">
            <Lightbulb className="h-3.5 w-3.5" /> For example
          </h3>
          <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-700 dark:text-zinc-300">{lesson.example}</p>
        </section>

        {/* Contextual help */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowHelp((v) => !v)}
            aria-expanded={showHelp}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <CircleHelp className="h-3.5 w-3.5" />
            {showHelp ? 'Hide help' : 'Need a hand with this?'}
            {showHelp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {showHelp && (
            <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
              {lesson.help}
            </p>
          )}
        </div>

        {/* The activity */}
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-zinc-400">Your turn</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              <Star className="h-3 w-3" /> {lesson.xp} XP
            </span>
          </div>
          <p className="mt-1.5 text-sm font-medium text-slate-900 dark:text-zinc-100">{lesson.activity.prompt}</p>

          {state.recognition === 'legacy' && (
            <p className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-2.5 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
              You already did this work before the journey existed. It is recognised — you can keep what you have or improve it.
            </p>
          )}

          <div className="mt-3">
            {kind === 'write' && (
              <WriteActivity
                lesson={lesson}
                text={text}
                onChange={setText}
                existing={state.evidence}
                minLength={lesson.activity.minLength ?? 20}
              />
            )}
            {kind === 'choice' && <ChoiceActivity lesson={lesson} value={optionId} onChange={setOptionId} />}
            {kind === 'form' && <FormActivity lesson={lesson} values={fields} onChange={(id, v) => setFields((f) => ({ ...f, [id]: v }))} />}
            {kind === 'priority' && <PriorityActivity lesson={lesson} order={order} onChange={setOrder} />}
            {kind === 'checklist' && <ChecklistActivity view={view} productId={productId} lessonId={lessonId} />}
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </p>
          )}
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-900/95">
        {done ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"><CheckCircle2 className="h-5 w-5" /></span>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-zinc-100">Lesson complete</p>
                <p className="text-xs text-slate-500 dark:text-zinc-400">
                  {done.xp > 0 ? `+${done.xp} XP added to your total` : 'Already counted — no XP awarded twice'}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Back to the map</Button>
              {done.nextLessonId && <Button icon={<ArrowRight className="h-4 w-4" />} onClick={() => onNext(done.nextLessonId)}>Next lesson</Button>}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-zinc-400">
              {alreadyDone
                ? 'You have completed this lesson. Submitting again keeps your progress and awards no extra XP.'
                : kind === 'checklist'
                  ? 'Confirm every step above, then finish the lesson.'
                  : 'Your answer is saved to the product when you finish.'}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Close</Button>
              <Button loading={complete.isPending} disabled={!canSubmit} onClick={submit} icon={<ArrowRight className="h-4 w-4" />}>
                {alreadyDone ? 'Save changes' : 'Complete lesson'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Lesson">
      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl dark:bg-zinc-900">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close lesson"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4 rotate-45" aria-hidden="true" />
        </button>
        {children}
      </div>
    </div>
  );
}

function worldLabel(view: LessonView, lessonId: string): string {
  for (const world of view.journey.worlds) {
    for (const unit of world.units) {
      if (unit.lessons.some((l) => l.id === lessonId)) return `World ${world.index} · ${world.title} · ${unit.title}`;
    }
  }
  return 'Journey';
}

function WriteActivity({
  lesson,
  text,
  onChange,
  existing,
  minLength
}: {
  lesson: Lesson;
  text: string;
  onChange: (v: string) => void;
  existing: string | null;
  minLength: number;
}) {
  const current = text || existing || '';
  const trimmed = current.trim();
  const remaining = Math.max(0, minLength - trimmed.length);
  return (
    <div>
      <textarea
        value={current}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder={lesson.activity.placeholder ?? 'Write your answer…'}
        aria-label={lesson.activity.prompt}
        className="w-full resize-y rounded-lg border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600"
      />
      <div className="mt-1.5 flex items-center justify-between text-[11px]">
        <span className={cx('font-medium', remaining > 0 ? 'text-slate-500 dark:text-zinc-400' : 'text-emerald-600 dark:text-emerald-400')}>
          {remaining > 0 ? `${remaining} more character${remaining === 1 ? '' : 's'} needed` : 'Long enough to save'}
        </span>
        <span className="text-slate-400 dark:text-zinc-600">{trimmed.length} characters</span>
      </div>
    </div>
  );
}

function ChoiceActivity({ lesson, value, onChange }: { lesson: Lesson; value: string | null; onChange: (id: string) => void }) {
  const options = lesson.activity.options ?? [];
  return (
    <div className="space-y-2" role="radiogroup" aria-label={lesson.activity.prompt}>
      {options.map((option) => {
        const selected = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.id)}
            className={cx(
              'flex w-full items-start gap-2.5 rounded-lg border p-3 text-left text-sm transition focus-visible:ring-2 focus-visible:ring-blue-500',
              selected
                ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-500/10'
                : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50'
            )}
          >
            <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 dark:border-zinc-600')}>
              {selected && <Check className="h-2.5 w-2.5" />}
            </span>
            <span>
              <span className={cx('block font-medium', selected ? 'text-blue-900 dark:text-blue-100' : 'text-slate-800 dark:text-zinc-200')}>{option.label}</span>
              {selected && <span className="mt-1 block text-xs text-slate-600 dark:text-zinc-400">{option.feedback}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function FormActivity({ lesson, values, onChange }: { lesson: Lesson; values: Record<string, string>; onChange: (id: string, v: string) => void }) {
  const fields = lesson.activity.fields ?? [];
  return (
    <div className="space-y-3">
      {fields.map((field) => {
        const id = `field-${lesson.id}-${field.id}`;
        const common =
          'w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-600';
        return (
          <div key={field.id}>
            <label htmlFor={id} className="mb-1 block text-xs font-semibold text-slate-700 dark:text-zinc-300">
              {field.label}
              {!field.required && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
            </label>
            {field.type === 'longtext' ? (
              <textarea id={id} rows={3} value={values[field.id] ?? ''} onChange={(e) => onChange(field.id, e.target.value)} placeholder={field.placeholder} className={cx(common, 'resize-y leading-6')} />
            ) : (
              <input
                id={id}
                type={field.type === 'number' || field.type === 'money' ? 'number' : 'text'}
                inputMode={field.type === 'number' || field.type === 'money' ? 'decimal' : 'text'}
                min={field.type === 'number' || field.type === 'money' ? 0 : undefined}
                value={values[field.id] ?? ''}
                onChange={(e) => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className={common}
              />
            )}
            {field.help && <p className="mt-1 text-[11px] text-slate-500 dark:text-zinc-500">{field.help}</p>}
          </div>
        );
      })}
    </div>
  );
}

function PriorityActivity({ lesson, order, onChange }: { lesson: Lesson; order: string[]; onChange: (order: string[]) => void }) {
  const items = lesson.activity.priorities ?? [];
  const move = (index: number, direction: -1 | 1) => {
    const next = [...order];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div>
      <p className="mb-2 text-[11px] text-slate-500 dark:text-zinc-400">Most important first. Use the arrows to reorder.</p>
      <ol className="space-y-2">
        {order.map((id, index) => {
          const item = items.find((i) => i.id === id);
          if (!item) return null;
          return (
            <li key={id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-zinc-700 dark:bg-zinc-900">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 dark:bg-zinc-800 dark:text-zinc-300">{index + 1}</span>
              <span className="min-w-0 flex-1 text-sm text-slate-800 dark:text-zinc-200">
                {item.label}
                {item.help && <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-zinc-500">{item.help}</span>}
              </span>
              <span className="flex shrink-0 gap-1">
                <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${item.label} up`} className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => move(index, 1)} disabled={index === order.length - 1} aria-label={`Move ${item.label} down`} className="flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ChecklistActivity({ view, productId, lessonId }: { view: LessonView; productId: string; lessonId: string }) {
  const toggle = useChecklistItem(productId, lessonId);
  const items = view.lesson.activity.items ?? [];
  const ticked = new Set(view.checkedItems);
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const checked = ticked.has(`${lessonId}:${item.id}`);
        return (
          <li key={item.id}>
            <label className={cx('flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition', checked ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-500/10' : 'border-slate-200 hover:bg-slate-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50')}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => toggle.mutate({ itemId: item.id, checked: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 dark:border-zinc-600"
              />
              <span className="min-w-0">
                <span className={cx('block text-sm font-medium', checked ? 'text-emerald-900 dark:text-emerald-200' : 'text-slate-800 dark:text-zinc-200')}>{item.label}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-zinc-500">Done when: {item.doneWhen}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Saves XP and level state are shown by the map; this badge is used on stage completion. */
export function RecognisedBadge({ state }: { state: LessonProgress }) {
  if (state.legacy) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
        <BadgeCheck className="h-3 w-3" /> Legacy work recognised
      </span>
    );
  }
  if (state.state === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
        <Sparkles className="h-3 w-3" /> Completed
      </span>
    );
  }
  if (state.state === 'locked') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
        <Lock className="h-3 w-3" /> Locked
      </span>
    );
  }
  return null;
}
