import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { CheckCircle2, ChevronLeft, ChevronRight, Layers3, ListChecks, SkipForward } from 'lucide-react';
import { getStage, isAnswered, questionsForStage, STAGES, type AnswerValue, type Product, type Question, type StageId } from '@sv/shared';
import { useAnswer } from '../../api/hooks';
import { Button, Card, cx, Input, ProgressBar, Textarea } from '../../components/ui';
import { useMoney } from '../../lib/money';

/** Renders the right control for a question type. `value` is the draft, not the saved answer. */
function AnswerInput({ q, value, onChange, onSubmit, autoFocus }: { q: Question; value: AnswerValue; onChange: (v: AnswerValue) => void; onSubmit?: () => void; autoFocus?: boolean }) {
  const { symbol } = useMoney();
  const enter = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  };

  switch (q.type) {
    case 'text':
      return <Input autoFocus={autoFocus} aria-label={q.prompt} maxLength={300} value={(value as string) ?? ''} placeholder={q.placeholder} onChange={(e) => onChange(e.target.value)} onKeyDown={enter} />;
    case 'longtext':
      return (
        <Textarea
          autoFocus={autoFocus}
          aria-label={q.prompt}
          rows={4}
          maxLength={5000}
          value={(value as string) ?? ''}
          placeholder={q.placeholder ?? 'Type your answer… (Enter to save, Shift+Enter for a new line)'}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={enter}
        />
      );
    case 'number':
    case 'money':
      return (
        <div className="relative max-w-xs">
          {q.type === 'money' && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">{symbol}</span>}
          <Input
            autoFocus={autoFocus}
            aria-label={q.prompt}
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            className={cx('tabular-nums', q.type === 'money' && 'pl-8')}
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            onKeyDown={enter}
          />
        </div>
      );
    case 'date':
      return <Input autoFocus={autoFocus} aria-label={q.prompt} type="date" className="max-w-xs" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} onKeyDown={enter} />;
    case 'yesno':
      return (
        <div className="flex gap-2">
          {[
            { v: true, label: 'Yes' },
            { v: false, label: 'Not yet' }
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={value === o.v}
              onClick={() => onChange(o.v)}
              className={cx(
                'min-w-24 rounded-lg border px-4 py-2 text-sm font-medium transition-colors',
                value === o.v ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      );
    case 'scale':
      return (
        <div>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={value === n}
                aria-label={`${n} of 5`}
                onClick={() => onChange(n)}
                className={cx(
                  'h-11 w-11 rounded-lg border text-sm font-semibold tabular-nums transition-all',
                  value === n ? 'scale-105 border-blue-500 bg-blue-600 text-white shadow-sm' : 'border-zinc-200 hover:border-blue-300 dark:border-zinc-700'
                )}
              >
                {n}
              </button>
            ))}
          </div>
          {q.scale && (
            <div className="mt-1.5 flex w-[15.5rem] justify-between text-[11px] text-zinc-500">
              <span>{q.scale[0]}</span>
              <span>{q.scale[1]}</span>
            </div>
          )}
        </div>
      );
    case 'choice':
    case 'multi': {
      const selected: string[] = q.type === 'multi' ? (Array.isArray(value) ? value : []) : typeof value === 'string' ? [value] : [];
      return (
        <div className="flex flex-wrap gap-2">
          {q.options?.map((o) => {
            const on = selected.includes(o);
            return (
              <button
                key={o}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  if (q.type === 'choice') onChange(o);
                  else onChange(on ? selected.filter((x) => x !== o) : [...selected, o]);
                }}
                className={cx(
                  'rounded-full border px-3 py-1.5 text-sm transition-colors',
                  on ? 'border-blue-500 bg-blue-500/10 font-medium text-blue-700 dark:text-blue-300' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
                )}
              >
                {o}
              </button>
            );
          })}
        </div>
      );
    }
  }
}

function formatAnswer(q: Question, v: AnswerValue, fmt: (n: number) => string) {
  if (v === null || v === undefined) return '';
  if (q.type === 'money' && typeof v === 'number') return fmt(v);
  if (q.type === 'yesno') return v ? 'Yes' : 'Not yet';
  if (q.type === 'scale') return `${v} / 5`;
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function Deck({ product, questions, stage, onDone }: { product: Product; questions: Question[]; stage: StageId; onDone: () => void }) {
  const answer = useAnswer(product.id);
  const firstOpen = Math.max(
    0,
    questions.findIndex((q) => !isAnswered(product.answers[q.key]))
  );
  const [i, setI] = useState(firstOpen);
  const q = questions[i];
  const [draft, setDraft] = useState<AnswerValue>(q ? (product.answers[q.key] ?? null) : null);
  const [draftKey, setDraftKey] = useState<string | undefined>(q?.key);
  const [finished, setFinished] = useState(false);

  // Reset the draft while rendering, not in an effect, when moving to another
  // question. An effect runs after the commit, so the next question's input
  // would render once still holding the previous answer -- a 1-5 scale number
  // arriving at a multi-choice question crashed on selected.includes().
  if (q && q.key !== draftKey) {
    setDraftKey(q.key);
    setDraft(product.answers[q.key] ?? null);
  }

  const answeredCount = questions.filter((x) => isAnswered(product.answers[x.key])).length;

  const advance = () => {
    if (i < questions.length - 1) setI(i + 1);
    else setFinished(true);
  };

  const save = () => {
    if (!q) return;
    const saved = product.answers[q.key] ?? null;
    if (!isAnswered(draft) || JSON.stringify(draft) === JSON.stringify(saved)) return advance();
    answer.mutate({ key: q.key, value: draft }, { onSuccess: advance });
  };

  if (finished || !q) {
    const allDone = answeredCount === questions.length;
    return (
      <Card className="relative overflow-hidden p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-semibold">{allDone ? `${stage} questions complete` : 'End of the deck'}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
          {allDone
            ? 'Your answers are saved. Review them any time as the product develops.'
            : `${questions.length - answeredCount} question${questions.length - answeredCount === 1 ? '' : 's'} left unanswered. You can come back to them any time.`}
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              setFinished(false);
              setI(0);
            }}
          >
            Review answers
          </Button>
          <Button onClick={onDone}>Done</Button>
        </div>
      </Card>
    );
  }

  const isDone = isAnswered(product.answers[q.key]);
  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-5">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>
            Question {i + 1} of {questions.length}
          </span>
          <span className={cx('rounded-full px-2 py-0.5 font-semibold', isDone ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-blue-500/10 text-blue-700 dark:text-blue-300')}>
            {isDone ? 'Answered' : `+${q.xp} XP`}
          </span>
        </div>
        <div className="mt-2 flex gap-1">
          {questions.map((x, n) => (
            <button
              key={x.key}
              onClick={() => setI(n)}
              aria-label={`Go to question ${n + 1}`}
              className={cx(
                'h-1.5 flex-1 rounded-full transition-colors',
                n === i ? 'bg-blue-600' : isAnswered(product.answers[x.key]) ? 'bg-emerald-400' : 'bg-zinc-200 dark:bg-zinc-800'
              )}
            />
          ))}
        </div>
      </div>
      <form
        key={q.key}
        className="animate-rise px-5 pb-5 pt-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <h3 className="text-lg font-semibold leading-snug">
          {q.prompt}
          {!q.required && <span className="ml-2 align-middle text-xs font-normal text-zinc-400">optional</span>}
        </h3>
        {q.help && <p className="mt-1 text-sm text-zinc-500">{q.help}</p>}
        <div className="mt-4">
          <AnswerInput q={q} value={draft} onChange={setDraft} onSubmit={save} autoFocus />
        </div>
        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" size="sm" disabled={i === 0} onClick={() => setI(i - 1)} icon={<ChevronLeft className="h-4 w-4" />}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={advance} icon={<SkipForward className="h-3.5 w-3.5" />}>
              Skip
            </Button>
            <Button type="submit" size="sm" loading={answer.isPending}>
              {isAnswered(draft) ? 'Save & next' : 'Next'} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}

function AllQuestions({ product, questions }: { product: Product; questions: Question[] }) {
  const answer = useAnswer(product.id);
  const { fmt } = useMoney();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AnswerValue>(null);

  return (
    <Card className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {questions.map((q) => {
        const saved = product.answers[q.key] ?? null;
        const isEditing = editing === q.key;
        return (
          <div key={q.key} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {isAnswered(saved) ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" /> : <span className="h-4 w-4 shrink-0 rounded-full border-2 border-zinc-300 dark:border-zinc-600" />}
                  {q.prompt}
                </p>
                {!isEditing && (
                  <p className={cx('ml-6 mt-1 whitespace-pre-wrap text-sm', isAnswered(saved) ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-400')}>
                    {isAnswered(saved) ? formatAnswer(q, saved, fmt) : `Not answered · +${q.xp} XP`}
                  </p>
                )}
              </div>
              {!isEditing && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(q.key);
                    setDraft(saved);
                  }}
                >
                  {isAnswered(saved) ? 'Edit' : 'Answer'}
                </Button>
              )}
            </div>
            {isEditing && (
              <form
                className="ml-6 mt-3 space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  answer.mutate({ key: q.key, value: draft }, { onSuccess: () => setEditing(null) });
                }}
              >
                <AnswerInput q={q} value={draft} onChange={setDraft} autoFocus />
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={answer.isPending}>
                    Save
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  {isAnswered(saved) && (
                    <Button size="sm" variant="ghost" onClick={() => answer.mutate({ key: q.key, value: null }, { onSuccess: () => setEditing(null) })}>
                      Clear answer
                    </Button>
                  )}
                </div>
              </form>
            )}
          </div>
        );
      })}
    </Card>
  );
}

export function DiscoverTab({ product }: { product: Product }) {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('stage') as StageId | null;
  const stage: StageId = fromUrl && STAGES.some((s) => s.id === fromUrl) ? fromUrl : product.stage;
  const questions = useMemo(() => questionsForStage(stage), [stage]);
  const answered = questions.filter((q) => isAnswered(product.answers[q.key])).length;
  const [mode, setMode] = useState<'deck' | 'list'>(answered === questions.length && questions.length > 0 ? 'list' : 'deck');

  const pickStage = (s: StageId) => {
    const next = new URLSearchParams(params);
    next.set('stage', s);
    setParams(next, { replace: true });
    const qs = questionsForStage(s);
    setMode(qs.every((q) => isAnswered(product.answers[q.key])) ? 'list' : 'deck');
  };

  const stageMeta = getStage(stage);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Question stage">
        {STAGES.map((s) => {
          const qs = questionsForStage(s.id);
          if (qs.length === 0) return null;
          const a = qs.filter((q) => isAnswered(product.answers[q.key])).length;
          const done = a === qs.length;
          return (
            <button
              key={s.id}
              role="tab"
              aria-selected={stage === s.id}
              onClick={() => pickStage(s.id)}
              className={cx(
                'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                stage === s.id ? 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300' : 'border-zinc-200 text-zinc-600 dark:border-zinc-800 dark:text-zinc-400'
              )}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" aria-hidden="true" />}
              {s.label}
              <span className="tabular-nums opacity-60">
                {a}/{qs.length}
              </span>
              {s.id === product.stage && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" title="Current stage" />}
            </button>
          );
        })}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Tell us · {stageMeta.label}</p>
          <h2 className="mt-0.5 text-base font-semibold">
            {answered} of {questions.length} answered
          </h2>
          <ProgressBar className="mt-2 w-48" value={questions.length ? (answered / questions.length) * 100 : 0} tone={answered === questions.length ? 'emerald' : 'indigo'} />
        </div>
        <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
          <button
            onClick={() => setMode('deck')}
            aria-pressed={mode === 'deck'}
            className={cx('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium', mode === 'deck' ? 'bg-zinc-100 dark:bg-zinc-800' : 'text-zinc-500')}
          >
            <Layers3 className="h-3.5 w-3.5" /> One at a time
          </button>
          <button
            onClick={() => setMode('list')}
            aria-pressed={mode === 'list'}
            className={cx('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium', mode === 'list' ? 'bg-zinc-100 dark:bg-zinc-800' : 'text-zinc-500')}
          >
            <ListChecks className="h-3.5 w-3.5" /> All
          </button>
        </div>
      </div>

      {mode === 'deck' ? (
        <Deck key={stage} product={product} questions={questions} stage={stage} onDone={() => setMode('list')} />
      ) : (
        <AllQuestions product={product} questions={questions} />
      )}
    </div>
  );
}
