import { useMemo, useState, type ReactNode } from 'react';
import { MessageSquare, Send, Users } from 'lucide-react';
import { QUESTIONS_BY_KEY, type Product } from '@sv/shared';
import { formatAnswer } from './AnswerInput';
import { useMoney } from '../../lib/money';
import type { Journey, JourneyStage, StageJourneyActivity, TeamContribution } from '@sv/shared';
import { useAddComment, useComments } from '../../api/collaboration';
import { Button, Spinner, Textarea } from '../ui';
import { ActivityDependencies } from './ActivityDependencies';
import { ActivityRow } from './ActivityRow';

/**
 * Activity list for one stage.
 *
 * The expanded row is controlled by the parent so a notification, the
 * recommendation card and `?activity=` can all open the same item, and so the
 * comment thread lives directly under the row it belongs to.
 */

/**
 * The activity list for one stage with ownership, status, blockers and review.
 *
 * This augments `StageOverview` rather than replacing it: the overview keeps its
 * calm "what/why/next" framing, and this handles the collaborative layer.
 */
export function StageActivities({
  productId,
  journey, dependencies, answers,
  stage,
  team,
  canManage,
  currentUserId,
  busy,
  openKey,
  onToggleKey,
  onOpenActivity,
  onAssign,
  onStatus,
  onSubmitReview,
  onReview,
  onJumpToBlocker
}: {
  productId: string;
  answers: Product['answers']; journey: Journey; dependencies: Record<string,string[]>;
  stage: JourneyStage;
  team: TeamContribution[];
  canManage: boolean;
  currentUserId: string;
  busy: boolean;
  /** Which activity row is expanded. */
  openKey: string | null;
  onToggleKey: (key: string) => void;
  onOpenActivity: (key: string) => void;
  onAssign: (key: string, assigneeId: string | null) => void;
  onStatus: (key: string, status: 'not_started' | 'in_progress' | 'needs_review' | 'completed' | 'blocked') => void;
  onSubmitReview: (key: string) => void;
  onReview: (key: string, decision: 'approve' | 'request_changes', note: string) => void;
  onJumpToBlocker: (key: string) => void;
}) {
  const { fmt } = useMoney();
  if (stage.activities.length === 0) {
    return <p className="px-4 py-4 text-sm text-zinc-500">Nothing to do here yet.</p>;
  }

  return (
    <ul>
      {stage.activities.map((activity) => (
        <li key={activity.id} className="contents">
          <ActivityRow
            recordedAnswer={activity.questionKey && activity.done ? formatAnswer(QUESTIONS_BY_KEY.get(activity.questionKey)!, answers[activity.questionKey], fmt) : undefined}
            activity={activity}
            team={team}
            canManage={canManage}
            currentUserId={currentUserId}
            busy={busy}
            isOpen={openKey === activity.id}
            onToggle={() => onToggleKey(activity.id)}
            onOpen={() => onOpenActivity(activity.id)}
            onAssign={(assigneeId) => onAssign(activity.id, assigneeId)}
            onStatus={(status) => onStatus(activity.id, status)}
            onSubmitReview={() => onSubmitReview(activity.id)}
            onReview={(decision, note) => onReview(activity.id, decision, note)}
            onJumpToBlocker={onJumpToBlocker}
          />
          {openKey === activity.id && (
            <div className="px-4 pb-3">
              <ActivityDependencies productId={productId} activityKey={activity.id} journey={journey} linked={dependencies[activity.id] ?? []} editable={canManage || !activity.collaboration?.assigneeId || activity.collaboration.assigneeId === currentUserId}/>
              <ActivityComments productId={productId} activityKey={activity.id} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Contextual comments for one activity, loaded only when opened. */
export function ActivityComments({ productId, activityKey }: { productId: string; activityKey: string }) {
  const { data, isLoading } = useComments(productId, activityKey);
  const add = useAddComment(productId);
  const [body, setBody] = useState('');

  const submit = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    add.mutate({ key: activityKey, body: trimmed }, { onSuccess: () => setBody('') });
  };

  return (
    <div className="mt-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        <MessageSquare className="h-3 w-3" aria-hidden="true" />
        Comments
      </p>
      {isLoading ? (
        <Spinner />
      ) : (data?.length ?? 0) === 0 ? (
        <p className="mt-1 text-xs text-zinc-500">No comments yet. Add context so the next person does not have to guess.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {data!.map((c) => (
            <li key={c.id} className="text-xs">
              <span className="font-semibold">{c.userName ?? 'Someone'}</span>
              <span className="ml-1.5 text-[10px] text-zinc-400">{new Date(c.createdAt).toLocaleString()}</span>
              <p className="mt-0.5 whitespace-pre-wrap leading-5 text-zinc-600 dark:text-zinc-300">{c.body}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex items-end gap-2">
        <Textarea
          aria-label="Add a comment"
          rows={2}
          className="flex-1 text-xs"
          placeholder="Add a comment…"
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button
          size="sm"
          onClick={submit}
          loading={add.isPending}
          disabled={!body.trim()}
          icon={<Send className="h-3.5 w-3.5" />}
        >
          Post
        </Button>
      </div>
    </div>
  );
}

/**
 * Who is doing what, across the whole product.
 *
 * Deliberately descriptive: counts of assigned/completed/in-progress/outstanding
 * activities. No scores, no rankings, no timestamps of individual activity —
 * the brief asks for accountability, not surveillance.
 */
export function TeamContributionCard({ team, currentUserId }: { team: TeamContribution[]; currentUserId: string }) {
  const active = useMemo(() => team.filter((m) => m.assigned > 0 || m.completed > 0), [team]);
  const rows = active.length > 0 ? active : team;

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900/60">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold">
        <Users className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        Who is doing what
      </h3>
      <p className="mt-0.5 text-xs text-zinc-500">Activity owners on this product. Counts only, so nothing here reads as a score.</p>

      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">Nobody has taken an activity yet. Assign one above to get started.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((m) => {
            const outstanding = Math.max(0, m.assigned - m.completed - m.inProgress);
            return (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 pb-2 last:border-0 last:pb-0 dark:border-zinc-800">
                <span className="min-w-0 truncate text-sm">
                  {m.name}
                  {m.userId === currentUserId && <span className="ml-1 text-[10px] text-zinc-400">(you)</span>}
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-1.5 text-[10px]">
                  <Chip tone="neutral">{m.assigned} assigned</Chip>
                  {m.completed > 0 && <Chip tone="good">{m.completed} done</Chip>}
                  {m.inProgress > 0 && <Chip tone="info">{m.inProgress} in progress</Chip>}
                  {outstanding > 0 && <Chip tone="muted">{outstanding} to start</Chip>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chip({ tone, children }: { tone: 'neutral' | 'good' | 'info' | 'muted'; children: ReactNode }) {
  const cls = {
    neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    good: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    info: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    muted: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
  }[tone];
  return <span className={`rounded-full px-1.5 py-0.5 font-medium ${cls}`}>{children}</span>;
}

export type { StageJourneyActivity };
