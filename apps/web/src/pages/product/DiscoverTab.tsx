import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useBlocker, useNavigate, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark,
  Check,
  CheckCheck,
  Clock3,
  FileText,
  NotebookPen
} from 'lucide-react';
import {
  CHAPTER_BRIEFS,
  requiresApproval,
  isAnswered,
  normaliseAnswer,
  questionsForStage,
  STAGE_GUIDES,
  STAGE_IDS,
  type ActivityDraft,
  type AnswerValue,
  type Product,
  type Question,
  type StageId
} from '@sv/shared';
import { useCollaboration } from '../../api/collaboration';
import { ApiError, del, put } from '../../api/client';
import { keys, useAnswer, useDrafts, useGuidePreferences, useSession } from '../../api/hooks';
import { AnswerInput, formatAnswer } from '../../components/journey/AnswerInput';
import { LessonCopilot } from '../../components/journey/LessonCopilot';
import { Button, Select, Spinner } from '../../components/ui';
import { useMoney } from '../../lib/money';

const lessonHref = (id: string, q: Question) => `/products/${id}/discover?stage=${q.stage}&q=${q.key}`;
export const briefHref = (id: string, stage: StageId) => `/products/${id}/discover?stage=${stage}&view=brief`;
const same = (a: AnswerValue, b: AnswerValue) => JSON.stringify(a) === JSON.stringify(b);
const relatedTools = (stage: StageId, physical: boolean): [string, string][] => {
  switch (stage) {
    case 'Research':
    case 'Planning':
    case 'Testing':
      return [['tasks', 'Open product tasks']];
    case 'Prototype':
      return [
        ['tasks', 'Track build tasks'],
        ['costs', 'Review cost sheet'],
        ...(physical
          ? ([
              ['materials', 'Bill of materials'],
              ['/suppliers', 'Supplier catalog']
            ] as [string, string][])
          : [])
      ];
    case 'Launch':
      return [
        ['costs', 'Review price and margin'],
        ['tasks', 'Release tasks']
      ];
    case 'Improvement':
      return [
        ['improve', 'Review improvement insights'],
        ['tasks', 'Track improvements']
      ];
    case 'Design':
      return physical ? [['materials', 'Review materials']] : [];
    default:
      return [];
  }
};

function Brief({ product, stage, questions }: { product: Product; stage: StageId; questions: Question[] }) {
  const { fmt } = useMoney();
  const recorded = questions.filter((q) => isAnswered(product.answers[q.key]));
  const links = relatedTools(stage, product.productKind === 'physical');
  return (
    <article className="sv-sheet p-5 sm:p-8">
      <p className="sv-kicker flex items-center gap-2">
        <FileText size={15} /> Product document
      </p>
      <h3 className="mt-2 text-2xl font-semibold tracking-tight">{CHAPTER_BRIEFS[stage]}</h3>
      <p className="mt-2 text-sm text-zinc-500">
        {recorded.length} recorded sections · {product.name}. These are your team’s notes, not verified findings.
      </p>
      {!recorded.length && (
        <p className="my-5 rounded-lg bg-slate-50 p-4 text-sm dark:bg-zinc-800">
          Your brief starts with your first answer. Open any section below to begin.
        </p>
      )}
      <dl className="mt-5 divide-y divide-zinc-200 dark:divide-zinc-800">
        {questions.map((q) => (
          <div key={q.key} className="py-4">
            <dt className="flex items-start justify-between gap-3">
              <span className="font-semibold">{q.output}</span>
              <Link className="sv-link text-xs" to={lessonHref(product.id, q)}>
                {isAnswered(product.answers[q.key]) ? 'Revise' : 'Add'} <span className="sr-only">{q.output}</span> →
              </Link>
            </dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {isAnswered(product.answers[q.key]) ? formatAnswer(q, product.answers[q.key], fmt) : 'Not recorded yet.'}
            </dd>
          </div>
        ))}
      </dl>
      {links.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
          {links.map(([tab, label]) => (
            <Link
              key={tab}
              className="sv-link text-sm"
              to={
                tab.startsWith('/') ? tab : `/products/${product.id}/${tab}${tab === 'tasks' ? `?stage=${stage}` : ''}`
              }
            >
              {label} ↗
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

function Lesson({
  product,
  q,
  questions,
  existing
}: {
  product: Product;
  q: Question;
  questions: Question[];
  existing?: ActivityDraft;
}) {
  const me = useSession(),
    prefs = useGuidePreferences(),
    qc = useQueryClient(),
    navigate = useNavigate();
  const answer = useAnswer(product.id),
    { fmt } = useMoney();
  const team = useCollaboration(product.id),
    owner = team.data?.records[q.key];
  const assignedElsewhere = me.workspace.role === 'member' && !!owner?.assigneeId && owner.assigneeId !== me.user.id;
  const saved = product.answers[q.key] ?? null;
  const initial = existing ? existing.value : saved;
  const [draft, setDraft] = useState(initial);
  const [base, setBase] = useState(existing ? existing.previousValue : saved);
  const [finished, setFinished] = useState(false),
    [issue, setIssue] = useState('');
  const safeToLeave = useRef(false);
  const advanced = me.user.guideMode === 'advanced';
  const saveDraft = useMutation({
    mutationFn: () => put<void>(`/products/${product.id}/drafts/${q.key}`, { value: draft, previousValue: base }),
    onSuccess: async () => {
      safeToLeave.current = true;
      await qc.invalidateQueries({ queryKey: ['activity-drafts'] });
      navigate(`/?view=journey&product=${product.id}`);
    }
  });
  const discardDraft = useMutation({
    mutationFn: () => del(`/products/${product.id}/drafts/${q.key}`),
    onSuccess: async () => {
      safeToLeave.current = true;
      await qc.invalidateQueries({ queryKey: ['activity-drafts'] });
      navigate(briefHref(product.id, q.stage));
    }
  });
  const dirty = !same(draft, initial) && !finished;
  const busy = answer.isPending || saveDraft.isPending || discardDraft.isPending;
  const blocker = useBlocker(() => !safeToLeave.current && (dirty || busy));
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (
      !busy &&
      window.confirm('Leave without saving these edits? Choose Cancel, then Save for later to keep a draft.')
    )
      blocker.proceed();
    else blocker.reset();
  }, [blocker, busy]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => {
      if (!safeToLeave.current && (dirty || busy)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const sessionChange = (e: Event) => {
      if (
        !safeToLeave.current &&
        (busy || (dirty && !window.confirm('Discard unsaved lesson edits before changing session?')))
      )
        e.preventDefault();
    };
    window.addEventListener('beforeunload', unload);
    window.addEventListener('sv:before-session-change', sessionChange);
    return () => {
      window.removeEventListener('beforeunload', unload);
      window.removeEventListener('sv:before-session-change', sessionChange);
    };
  }, [dirty, busy]);
  const change = (v: AnswerValue) => {
    safeToLeave.current = false;
    setDraft(v);
    setIssue('');
  };
  const save = (v: AnswerValue) => {
    const normal = normaliseAnswer(q, v);
    if ('error' in normal || (v !== null && !isAnswered(normal.value)))
      return setIssue('error' in normal ? normal.error : 'Add a response, or save this as a draft.');
    answer.mutate(
      { key: q.key, value: normal.value, previousValue: base },
      {
        onSuccess: () => {
          safeToLeave.current = true;
          if (v === null) navigate(briefHref(product.id, q.stage));
          else setFinished(true);
        },
        onError: (e) => {
          setIssue(e.message);
          if (e instanceof ApiError && e.status === 409) qc.invalidateQueries({ queryKey: keys.data });
        }
      }
    );
  };
  const i = questions.findIndex((x) => x.key === q.key),
    stale = !same(base, saved);
  // Prefer remaining core activities. Optional detail is always accessible in the brief.
  const rest = [...questions.slice(i + 1), ...questions.slice(0, i)].filter((x) => !isAnswered(product.answers[x.key]));
  const next = rest.find((x) => x.required);
  const example = (
    <div className="mt-4 border-l-2 border-teal-500 pl-4">
      <p className="sv-kicker">Example</p>
      <p className="mt-1 text-sm leading-6">{q.example}</p>
    </div>
  );
  if (finished)
    return (
      <section className="sv-sheet animate-rise p-6 sm:p-9" aria-live="polite">
        <span className="sv-icon">
          <CheckCheck size={22} />
        </span>
        <p className="sv-kicker mt-6">Activity recorded</p>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight">Your {q.output.toLowerCase()} is saved.</h3>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          You can revise it in your {CHAPTER_BRIEFS[q.stage].toLowerCase()}.{' '}
          {requiresApproval(q.key) &&
            product.approvalStates?.[q.key] !== 'approved' &&
            'This decision also needs chapter review.'}
        </p>
        <blockquote className="my-5 max-h-56 overflow-auto whitespace-pre-wrap break-words border-l-2 border-teal-600 pl-4 text-sm">
          {formatAnswer(q, saved, fmt)}
        </blockquote>
        <div className="flex flex-wrap items-center gap-4">
          <Button
            onClick={() =>
              navigate(next ? lessonHref(product.id, next) : `/products/${product.id}/journey?stage=${q.stage}`)
            }
          >
            {next ? `Next: ${next.output}` : 'Review chapter progress'} <ArrowRight size={15} />
          </Button>
          <Link className="sv-link text-sm" to={briefHref(product.id, q.stage)}>
            Read brief
          </Link>
        </div>
      </section>
    );
  return (
    <div className="space-y-4">
      <article className="sv-sheet overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 px-5 py-3 text-xs text-zinc-500 sm:px-8 dark:border-zinc-700">
          <span className="flex items-center gap-2">
            <NotebookPen size={15} /> Activity {i + 1} / {questions.length} · {q.required ? 'Core' : 'Optional'}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3 size={14} />
            {['longtext', 'evidence', 'ranked', 'comparison'].includes(q.type) ? '3–5 min' : '1–2 min'}
          </span>
        </div>
        <div className="p-5 sm:p-8">
          <p className="sv-kicker">Create your {q.output.toLowerCase()}</p>
          <p className="mt-3 max-w-prose text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {advanced ? q.advanced : q.help}
          </p>
          {advanced ? (
            <details className="mt-2 text-xs">
              <summary className="sv-link cursor-pointer">See a worked example</summary>
              {example}
            </details>
          ) : (
            example
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!assignedElsewhere && !busy && !stale && isAnswered(draft)) save(draft);
            }}
            className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-700"
          >
            <fieldset disabled={busy}>
              <legend className="mb-4 text-xl font-semibold leading-snug tracking-tight">{q.prompt}</legend>
              {existing && (
                <p className="mb-3 text-xs font-medium text-teal-700 dark:text-teal-300">
                  Restored your private draft · {new Date(existing.updatedAt).toLocaleDateString()}
                </p>
              )}
              {assignedElsewhere && (
                <p className="my-2 text-sm" role="note">
                  Assigned to {owner?.assigneeName ?? 'a teammate'}. You can keep a private draft, but only the assignee
                  or a workspace manager can change the shared answer.
                </p>
              )}
              <AnswerInput q={q} value={draft} onChange={change} />
              {q.syncsTo && (
                <p className="mt-2 text-xs text-zinc-500">
                  Also updates{' '}
                  {q.syncsTo === 'overhead' || q.syncsTo === 'targetSellingPrice'
                    ? 'the live cost sheet'
                    : `the product ${q.syncsTo}`}
                  .
                </p>
              )}
              {stale && (
                <div role="alert" className="my-3 rounded-md border border-amber-400 p-3 text-sm">
                  <strong>The shared answer has changed.</strong>
                  <p className="my-2 whitespace-pre-wrap break-words">
                    Current record: {formatAnswer(q, saved, fmt) || 'Not recorded'}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setBase(saved);
                      setIssue('');
                    }}
                  >
                    Reviewed · keep my edits
                  </Button>
                </div>
              )}
              {(issue || saveDraft.isError || discardDraft.isError) && (
                <p className="mt-3 text-sm text-rose-600" role="alert">
                  {issue || saveDraft.error?.message || discardDraft.error?.message}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-2">
                <Button
                  type="submit"
                  loading={answer.isPending}
                  disabled={!isAnswered(draft) || stale || assignedElsewhere}
                >
                  <Check size={16} />
                  {isAnswered(saved) ? 'Save revision' : 'Complete activity'}
                </Button>
                <Button variant="secondary" loading={saveDraft.isPending} onClick={() => saveDraft.mutate()}>
                  <Bookmark size={15} /> Save for later
                </Button>
              </div>
            </fieldset>
          </form>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <button
              className="sv-link"
              disabled={prefs.isPending || busy}
              onClick={() => prefs.mutate({ guideMode: advanced ? 'beginner' : 'advanced' })}
            >
              {advanced ? 'Use beginner guidance' : 'Use advanced guidance'}
            </button>
            {existing && (
              <button
                disabled={busy}
                className="text-zinc-500 underline"
                onClick={() => {
                  if (window.confirm('Discard this private draft? The shared answer will not change.'))
                    discardDraft.mutate();
                }}
              >
                Discard draft
              </button>
            )}
            {isAnswered(saved) && (
              <button
                disabled={busy || stale || assignedElsewhere}
                className="text-zinc-500 underline"
                onClick={() => {
                  if (
                    window.confirm(
                      'Clear this section of the brief? Existing cost or product fields and previously earned XP are kept.'
                    )
                  )
                    save(null);
                }}
              >
                Clear answer
              </button>
            )}
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            First recorded answer: {q.xp} XP once across the team. Saving a draft or editing an existing answer does not
            earn answer XP again.
          </p>
        </div>
      </article>
      <LessonCopilot disabled={busy} product={product} q={q} draft={draft} onUse={change} />
    </div>
  );
}

export function DiscoverTab({ product }: { product: Product }) {
  const [params, setParams] = useSearchParams(),
    drafts = useDrafts();
  const wanted = params.get('stage') as StageId,
    stage = STAGE_IDS.includes(wanted) ? wanted : product.stage;
  const list = questionsForStage(stage, product.productKind);
  // Inapplicable historical work stays readable (e.g. when changing product type).
  const personal = drafts.data?.filter((d) => d.productId === product.id) ?? [];
  const questions = [
    ...list,
    ...questionsForStage(stage).filter(
      (q) => !list.includes(q) && (isAnswered(product.answers[q.key]) || personal.some((d) => d.questionKey === q.key))
    )
  ];
  const q =
    questions.find((x) => x.key === params.get('q')) ??
    questions.find(
      (x) => x.key === personal.find((d) => questions.some((item) => item.key === d.questionKey))?.questionKey
    ) ??
    questions.find((x) => x.required && !isAnswered(product.answers[x.key])) ??
    questions[0];
  const brief = params.get('view') === 'brief';
  // Pin the location before editing. A successful write must not replace the
  // current lesson with the next unanswered one mid-render.
  useEffect(() => {
    if (drafts.data && !brief && params.get('q') !== q.key) setParams({ stage, q: q.key }, { replace: true });
  }, [drafts.data, brief, params, q.key, setParams, stage]);
  if (drafts.isLoading) return <Spinner label="Loading your lesson and drafts" />;
  if (drafts.isError && !drafts.data)
    return (
      <p role="alert">
        Could not restore your drafts.{' '}
        <Button variant="secondary" onClick={() => drafts.refetch()}>
          Retry
        </Button>
      </p>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="sv-link inline-flex items-center gap-1 text-xs"
          to={`/products/${product.id}/journey?stage=${stage}`}
        >
          <ArrowLeft size={14} /> Chapter overview
        </Link>
        <Select
          aria-label="Choose chapter"
          className="w-auto py-1.5 text-xs"
          value={stage}
          onChange={(e) => setParams({ stage: e.target.value, ...(brief ? { view: 'brief' } : {}) })}
        >
          {STAGE_IDS.filter((s) => s !== 'Retired' || product.stage === s).map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </div>
      <div>
        <p className="sv-kicker">
          {stage === 'Retired' ? 'Archive' : `Chapter ${String(STAGE_IDS.indexOf(stage) + 1).padStart(2, '0')} / 08`} ·{' '}
          {stage}
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">{STAGE_GUIDES[stage].purpose}</h2>
      </div>
      <div className="flex gap-4 border-b border-zinc-200 text-sm dark:border-zinc-700">
        {[
          { label: 'Activity', icon: BookOpen, on: !brief, to: lessonHref(product.id, q) },
          { label: 'Chapter brief', icon: FileText, on: brief, to: briefHref(product.id, stage) }
        ].map((t) => (
          <Link
            key={t.label}
            to={t.to}
            aria-current={t.on ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 border-b-2 pb-2 ${t.on ? 'border-teal-600 font-semibold' : 'border-transparent text-zinc-500'}`}
          >
            <t.icon size={15} />
            {t.label}
          </Link>
        ))}
      </div>
      {brief ? (
        <Brief product={product} stage={stage} questions={questions} />
      ) : (
        <Lesson
          key={`${product.id}:${q.key}`}
          product={product}
          q={q}
          questions={questions}
          existing={personal.find((d) => d.questionKey === q.key)}
        />
      )}
      {!brief && (
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-zinc-500">Browse this chapter’s activities</summary>
          <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
            {questions.map((x) => (
              <li key={x.key}>
                <Link className="flex items-center gap-2 py-2.5" to={lessonHref(product.id, x)}>
                  {isAnswered(product.answers[x.key]) ? (
                    <Check size={15} className="text-teal-600" />
                  ) : (
                    <span className="w-[15px] text-center">·</span>
                  )}
                  {x.output}
                  <span className="ml-auto text-xs text-zinc-500">{x.required ? 'Core' : 'Optional'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
