import { useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  MessageSquare,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import {
  ACTIVITY_STATUS_LABELS,
  type ActivityStatus,
  type StageJourneyActivity,
  type TeamContribution
} from '@sv/shared';
import { Button, cx, Input, Select } from '../ui';

/** Colour + icon per status, so state is readable without relying on colour. */
const STATUS_STYLE: Record<ActivityStatus, { chip: string; icon: typeof Circle }> = {
  not_started: { chip: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300', icon: Circle },
  in_progress: { chip: 'bg-blue-500/10 text-blue-700 dark:text-blue-400', icon: Clock },
  needs_review: { chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', icon: ShieldCheck },
  completed: { chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', icon: CheckCircle2 },
  blocked: { chip: 'bg-rose-500/10 text-rose-700 dark:text-rose-400', icon: AlertTriangle }
};

export interface ActivityRowProps {
  activity: StageJourneyActivity;
  team: TeamContribution[];
  /** True when the signed-in user may assign to other people. */
  canManage: boolean;
  currentUserId: string;
  isOpen: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onAssign: (assigneeId: string | null) => void;
  onStatus: (status: ActivityStatus) => void;
  onSubmitReview: () => void;
  onReview: (decision: 'approve' | 'request_changes', note: string) => void;
  onJumpToBlocker: (key: string) => void;
  busy?: boolean;
}

export function ActivityRow({
  activity,
  team,
  canManage,
  currentUserId,
  isOpen,
  onToggle,
  onOpen,
  onAssign,
  onStatus,
  onSubmitReview,
  onReview,
  onJumpToBlocker,
  busy
}: ActivityRowProps) {
  const [note, setNote] = useState('');
  const c = activity.collaboration;
  const status: ActivityStatus = c?.status ?? 'not_started';
  const style = STATUS_STYLE[status];
  const StatusIcon = style.icon;
  const blockers = c?.blockers ?? [];
  const awaitingApproval = c?.awaitingApproval ?? false;
  const pendingReview = c?.reviewState === 'pending';
  const changesRequested = c?.reviewState === 'changes_requested';
  const isBlocked = blockers.length > 0 || status === 'blocked';
  const assigneeId = c?.assigneeId ?? null;
  const mine = assigneeId === currentUserId;
  const unassigned = !assigneeId;
  // Members may only act on their own (or unclaimed) work; the server enforces
  // this too, so the UI is a courtesy rather than the security boundary.
  const canActOnThis = canManage || mine || unassigned;

  return (
    <div className={cx('border-b border-zinc-100 last:border-0 dark:border-zinc-800')}>
      <div className={cx('px-4 py-3', isBlocked && 'bg-rose-50/40 dark:bg-rose-950/10')}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {activity.done && !awaitingApproval ? (
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            ) : (
              <Circle className={cx('h-5 w-5', activity.required ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-200 dark:text-zinc-700')} />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={isOpen}
              className="block w-full text-left"
            >
              <span className={cx('block text-sm', activity.done && !awaitingApproval ? 'text-zinc-400 line-through' : 'font-medium')}>
                {activity.label}
                {!activity.required && <span className="ml-1.5 text-[11px] font-normal text-zinc-400">optional</span>}
              </span>
            </button>

            {/* One line of state: status, owner, blockers, review. */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className={cx('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', style.chip)}>
                <StatusIcon className="h-3 w-3" aria-hidden="true" />
                {ACTIVITY_STATUS_LABELS[status]}
              </span>

              {assigneeId ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  <UserRound className="h-3 w-3" aria-hidden="true" />
                  {mine ? 'You' : c?.assigneeName ?? 'Assigned'}
                </span>
              ) : (
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800">Unassigned</span>
              )}

              {awaitingApproval && (
                <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  {pendingReview ? 'Awaiting review' : 'Needs approval'}
                </span>
              )}
              {changesRequested && (
                <span className="rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                  Changes requested
                </span>
              )}
              {blockers.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-400">
                  <Lock className="h-3 w-3" aria-hidden="true" />
                  Blocked
                </span>
              )}
              {c && c.commentCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500">
                  <MessageSquare className="h-3 w-3" aria-hidden="true" />
                  {c.commentCount}
                </span>
              )}
              {c?.completedAt && c.completedByName && (
                <span className="text-[10px] text-zinc-400">
                  by {c.completedByName} · {new Date(c.completedAt).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Blockers are shown right here, never hidden behind a menu. */}
            {blockers.length > 0 && (
              <ul className="mt-2 space-y-1">
                {blockers.map((b) => (
                  <li key={b.blockedByKey} className="flex items-start gap-1.5 text-xs text-rose-700 dark:text-rose-400">
                    <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{b.resolution}</span>
                    <button
                      type="button"
                      onClick={() => onJumpToBlocker(b.blockedByKey)}
                      className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline"
                    >
                      Go
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!activity.done && !isBlocked && (
            <button
              type="button"
              onClick={onOpen}
              className="mt-0.5 shrink-0 text-zinc-400 transition-colors hover:text-zinc-700 dark:hover:text-zinc-200"
              aria-label={`Open ${activity.label}`}
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Expanded controls: ownership, status, review. */}
        {isOpen && (
          <div className="mt-3 space-y-3 rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/40">
            {blockers.length === 0 && <p className="text-xs leading-5 text-zinc-500">{activity.why}</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Owner</span>
                <Select
                  aria-label={`Owner for ${activity.label}`}
                  className="w-full py-1 text-xs"
                  value={assigneeId ?? ''}
                  disabled={!canActOnThis || busy}
                  onChange={(e) => onAssign(e.target.value || null)}
                >
                  <option value="">Unassigned</option>
                  {team.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.userId === currentUserId ? `${m.name} (you)` : m.name}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Status</span>
                <Select
                  aria-label={`Status for ${activity.label}`}
                  className="w-full py-1 text-xs"
                  value={status}
                  disabled={!canActOnThis || busy || pendingReview}
                  onChange={(e) => onStatus(e.target.value as ActivityStatus)}
                >
                  <option value="not_started">Not started</option>
                  <option value="in_progress">In progress</option>
                  <option value="blocked">Blocked</option>
                  <option value="completed">Completed</option>
                </Select>
              </label>
            </div>

            {awaitingApproval && !pendingReview && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" loading={busy} icon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={onSubmitReview}>
                  Submit for review
                </Button>
                <span className="text-[11px] text-zinc-500">This activity only counts once a reviewer approves it.</span>
              </div>
            )}

            {pendingReview && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 text-xs dark:border-amber-900/50 dark:bg-amber-950/20">
                <p className="font-medium text-amber-800 dark:text-amber-300">Waiting for a reviewer.</p>
                {canManage ? (
                  <div className="mt-2 space-y-2">
                    <Input
                      aria-label="Feedback for the author"
                      placeholder="Optional feedback…"
                      className="text-xs"
                      value={note}
                      maxLength={2000}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" loading={busy} onClick={() => onReview('approve', note)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" loading={busy} onClick={() => onReview('request_changes', note)}>
                        Request changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-0.5 text-amber-700 dark:text-amber-400">An owner or admin will review it shortly.</p>
                )}
              </div>
            )}

            {changesRequested && c?.reviewNote && (
              <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                <span className="font-semibold">Reviewer: </span>
                {c.reviewNote}
              </p>
            )}

            {!isBlocked && (
              <button
                type="button"
                onClick={onOpen}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16598d] hover:underline dark:text-blue-400"
              >
                {activity.done ? 'Review this activity' : 'Work on this activity'}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
