import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  Compass,
  Flag,
  LockKeyhole,
  MapPin,
  Milestone,
  ShieldCheck,
  Sparkles,
  Trophy
} from 'lucide-react';
import {
  CHAPTER_BRIEFS,
  nextStage,
  nextWork,
  productHealth,
  STAGE_GUIDES,
  PATH_STAGES,
  type Trail,
  type StageId,
  type Material,
  type Product,
  type TrailLesson,
  type World,
  type WorldId
} from '@sv/shared';
import { useCollaboration } from '../../api/collaboration';
import {
  useConfirmPlacement,
  useDrafts,
  useGame,
  useSession,
  useUpdateProduct,
  useWorldCheck
} from '../../api/hooks';
import { Button, Spinner } from '../ui';
import { stageIcon } from './JourneyMap';

const names = {
  completed: 'Completed',
  in_progress: 'In progress',
  needs_review: 'Needs review',
  not_started: 'Not started · available',
  legacy_recognised: 'Legacy recognised'
};
const guided = (l: TrailLesson) => (l.href.includes('/discover?') ? l.href + '&guided=1' : l.href);
function Node({ l, current }: { l: TrailLesson; current: boolean }) {
  const Icon = l.done
    ? Check
    : l.lock
      ? LockKeyhole
      : current
        ? MapPin
        : l.state === 'needs_review'
          ? BookOpen
          : Compass;
  const inside = (
    <>
      <span className="sv-stop-icon">
        <Icon size={18} />
      </span>
      <span className="min-w-0">
        <strong className="block break-words text-sm">{l.title}</strong>
        <small className="block text-xs leading-5">
          {current ? 'Current lesson' : l.lock ? 'Locked' : names[l.state]}
          {!l.required ? ' · enrichment' : ''}
          {l.lock ? ' · ' + l.lock : l.reason ? ' · ' + l.reason : ''}
        </small>
      </span>
      {!l.lock && <ArrowRight className="ml-auto shrink-0" size={15} />}
    </>
  );
  return (
    <li
      className={`sv-stop ${l.done ? 'sv-done' : l.lock ? 'sv-locked' : current ? 'sv-current' : ''}`}
      aria-current={current ? 'step' : undefined}
    >
      {l.lock ? (
        <div className="sv-stop-body">{inside}</div>
      ) : (
        <Link className="sv-stop-body" to={guided(l)}>
          {inside}
        </Link>
      )}
    </li>
  );
}
function Checkpoint({ p, w, rewards }: { p: Product; w: World; rewards: Trail['rewards'] }) {
  const check = useWorldCheck(p.id),
    move = useUpdateProduct(p.id),
    [checked, setChecked] = useState(false);
  const next = nextStage(w.stage);
  return (
    <div id={`checkpoint-${w.stage}`} className="sv-gate scroll-mt-20">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} />
        <p className="sv-kicker">Checkpoint / {CHAPTER_BRIEFS[w.stage]}</p>
      </div>
      <h4 className="mt-2 font-semibold">
        {w.ready ? 'Your evidence meets this checkpoint.' : 'Review your evidence.'}
      </h4>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-medium">
          {w.done} of {w.total} requirements met · {rewards.checkpoint} XP once · inspect checklist
        </summary>
        <ul className="mt-2 space-y-1.5">
          {w.units
            .flatMap((u) => u.lessons)
            .filter((l) => l.required)
            .map((l) => (
              <li key={l.key}>
                {l.done ? '✓' : '○'}{' '}
                <Link to={l.href} className="underline">
                  {l.title}
                </Link>
                {l.reason ? ' — ' + l.reason : ''}
              </li>
            ))}
        </ul>
      </details>
      {!w.ready && w.checkpoint && (
        <p className="mt-2 text-xs">Evidence changed since the previous pass. Your XP is kept.</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="secondary"
          disabled={!!w.lock || check.isPending}
          onClick={() => check.mutate({ world: w.stage, op: 'check' }, { onSuccess: () => setChecked(true) })}
        >
          Check evidence
        </Button>
        <Link className="sv-link text-xs" to={`/products/${p.id}/journey?stage=${w.stage}`}>
          Reviews &amp; team work →
        </Link>
      </div>
      {check.isError && (
        <p className="mt-2 text-xs" role="alert">
          {check.error.message}
        </p>
      )}
      {checked && w.ready && (
        <p role="status" className="mt-2 text-xs">
          Checkpoint passed. Rechecking does not repeat the reward.
        </p>
      )}
      <div className="sv-world-end">
        <Flag size={18} />
        <div className="min-w-0 flex-1">
          <strong className="block text-sm">
            {w.finished ? 'World milestone recorded' : `${w.stage} world milestone`}
          </strong>
          <small>
            {w.finished
              ? 'Kept in your product history.'
              : w.ready
                ? 'Ready to close this world.'
                : `Pass the checkpoint to unlock · ${rewards.world} XP`}
          </small>
        </div>
        {w.ready && !w.lock && !w.finished && (
          <Button
            size="sm"
            disabled={check.isPending || (!w.checkpoint && !checked)}
            onClick={() => check.mutate({ world: w.stage, op: 'finish' })}
          >
            Finish world
          </Button>
        )}
        {w.finished && w.ready && next && p.stage === w.stage && (
          <Button size="sm" loading={move.isPending} onClick={() => move.mutate({ stage: next })}>
            Enter {next}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Product selection, not an optional analytics dashboard. All node verdicts come from the scoped API. */
export function WorldPath({ product: p, materials }: { product: Product; materials: Map<string, Material> }) {
  const collab = useCollaboration(p.id),
    personal = useDrafts(),
    game = useGame(),
    me = useSession();
  const repair = useConfirmPlacement(p.id),
    [placement, setPlacement] = useState<StageId>(p.stage);
  const [expanded, setExpanded] = useState<WorldId | null>(p.stage === 'Retired' ? null : p.stage);
  useEffect(() => setExpanded(p.stage === 'Retired' ? null : p.stage), [p.id, p.stage]);
  if (collab.isError && !collab.data)
    return (
      <div role="alert" className="sv-sheet p-5">
        Could not load the product path.{' '}
        <Button variant="secondary" onClick={() => collab.refetch()}>
          Retry
        </Button>
      </div>
    );
  if (!collab.data?.trail) return <Spinner label="Reading product evidence" />;
  const { trail, journey, recommendations } = collab.data,
    root = `/products/${p.id}`,
    here = trail.worlds.find((w) => w.stage === p.stage),
    next = trail.next,
    g = game.data;
  const resume = nextWork(p, journey, recommendations, personal.data ?? [], trail);
  const health = productHealth(p, materials),
    total = trail.worlds.reduce((n, w) => n + w.total, 0),
    done = trail.worlds.reduce((n, w) => n + w.done, 0);
  return (
    <div className="sv-atlas" aria-label="Product development path">
      {trail.upgrade && (
        <details className="sv-upgrade">
          <summary>
            <strong>Your journey has been upgraded.</strong> You’re still at {p.stage}. Your records, access and XP
            are intact.
          </summary>
          <p className="mt-2">
            Originally recorded at “{trail.upgrade.originalStage}”. {trail.upgrade.knownKeys.length} prior answer
            sections recognised, including {trail.upgrade.importedKeys.length} exact product-field matches.{' '}
            {trail.upgrade.counts.tasks ?? 0} tasks and {trail.upgrade.counts.designs ?? 0} linked diagrams
            retained. A reached world is not a completed world. No XP was added for migration.
          </p>
        </details>
      )}
      {trail.upgrade?.needsPlacement && (
        <div className="sv-upgrade">
          <strong>Check this product’s position.</strong> “{trail.upgrade.originalStage}” was not a known stage. We
          used the last recorded visit or available work as a starting point.{' '}
          {me.workspace.role === 'member' ? (
            'Ask a workspace manager to confirm it.'
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <label>
                Confirmed world{' '}
                <select
                  className="rounded border bg-transparent p-1"
                  value={placement}
                  onChange={(e) => setPlacement(e.target.value as StageId)}
                >
                  {PATH_STAGES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <Button
                size="sm"
                variant="secondary"
                loading={repair.isPending}
                onClick={() => repair.mutate(placement)}
              >
                Confirm placement without XP
              </Button>
            </div>
          )}
        </div>
      )}
      <header className="sv-atlas-head">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[.17em] text-teal-200">
            <Compass size={15} /> Product field atlas / {String(journey.currentIndex + 1).padStart(2, '0')}
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            {p.name} <span className="text-teal-200">/ {p.stage}</span>
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-200">
            {here
              ? STAGE_GUIDES[here.stage].purpose
              : 'This product is archived. You can still read its briefs, tasks and journey history.'}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-teal-100">
            {Math.round((done / Math.max(1, total)) * 100)}% overall · {done}/{total} core outputs
          </p>
          <progress
            className="sv-progress mt-2"
            value={done}
            max={Math.max(1, total)}
            aria-label="Overall journey progress"
          />
          <p className="mt-1 text-xs text-slate-200">
            {trail.worlds.filter((w) => w.finished).length}/8 world milestones recorded
          </p>
        </div>
      </header>
      <div className="sv-atlas-layout">
        <section aria-label="Your product journey" className="min-w-0">
          <div className="sv-direction">
            <div>
              <p className="sv-kicker">Next recommended action</p>
              <h3 className="mt-1 font-semibold">{resume.title}</h3>
              <p className="mt-1 text-xs opacity-75">{resume.reason}</p>
            </div>
            <Link className="sv-primary-link shrink-0" to={resume.href}>
              {resume.action}
              <ArrowRight size={14} />
            </Link>
          </div>
          <ol className="sv-trail">
            {trail.worlds.map((w, i) => {
              const open = w.stage === expanded,
                active = w.stage === p.stage,
                Icon = stageIcon(w.stage);
              return (
                <li key={w.stage} className={`sv-world ${active ? 'sv-here' : ''}`} data-world={w.stage}>
                  <button
                    type="button"
                    className="sv-world-bar"
                    aria-expanded={open}
                    aria-controls={`unit-path-${p.id}-${i}`}
                    onClick={() => setExpanded(open ? null : w.stage)}
                  >
                    <span className="sv-world-pin">{w.finished ? <Flag size={21} /> : <Icon size={21} />}</span>
                    <span className="min-w-0 flex-1 text-left">
                      <span className="sv-kicker">
                        World {String(i + 1).padStart(2, '0')} ·{' '}
                        {active
                          ? 'You are here'
                          : w.finished
                            ? 'Milestone recorded'
                            : w.recognised
                              ? 'Legacy recognised'
                              : w.lock
                                ? 'Upcoming'
                                : 'Available'}
                      </span>
                      <strong className="block text-lg font-semibold">{w.stage}</strong>
                      <span className="block text-xs opacity-75">
                        {w.lock ?? `${CHAPTER_BRIEFS[w.stage]} · ${w.done}/${w.total} core outputs`}
                      </span>
                    </span>
                    <ChevronDown size={17} className={open ? 'rotate-180' : ''} />
                  </button>
                  {open && (
                    <div className="sv-world-body" id={`unit-path-${p.id}-${i}`}>
                      <div className="mb-3 flex flex-wrap gap-4 text-xs">
                        <Link className="sv-link" to={`${root}/journey?stage=${w.stage}`}>
                          World workspace →
                        </Link>
                        <Link className="sv-link" to={`${root}/discover?stage=${w.stage}&view=brief`}>
                          Read {CHAPTER_BRIEFS[w.stage].toLowerCase()} →
                        </Link>
                      </div>
                      {w.units.map((u, j) => (
                        <details
                          className="sv-trail-unit"
                          key={u.id}
                          open={u.lessons.some((l) => l.key === next?.key) || undefined}
                        >
                          <summary>
                            <span className="font-mono text-xs opacity-65">
                              {i + 1}.{j + 1}
                            </span>
                            <strong className="min-w-0 flex-1 text-sm">{u.title}</strong>
                            <span className="text-xs tabular-nums">
                              {u.done}/{u.total}
                            </span>
                            {u.complete ? (
                              <Check size={15} />
                            ) : u.lock ? (
                              <LockKeyhole size={14} />
                            ) : (
                              <ChevronDown size={14} />
                            )}
                          </summary>
                          <ol className="sv-stops">
                            {u.lessons.map((l) => (
                              <Node key={l.key} l={l} current={next?.key === l.key} />
                            ))}
                          </ol>
                          <p className="sv-unit-end">
                            <Milestone size={15} />
                            {u.complete
                              ? 'Unit complete'
                              : `Unit milestone · ${u.total - u.done} core outputs remaining`}{' '}
                            · {trail.rewards.unit} XP once
                          </p>
                        </details>
                      ))}
                      <Checkpoint p={p} w={w} rewards={trail.rewards} />
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
        <aside aria-label="Builder progress" className="space-y-3">
          <div className="sv-atlas-side">
            <p className="sv-kicker">
              <Trophy size={14} /> Builder record
            </p>
            {g ? (
              <>
                <h3 className="mt-2 font-semibold">
                  Level {g.level} · {g.levelTitle}
                </h3>
                <p className="mt-1 text-sm">
                  {g.xp} XP <span className="text-xs opacity-65">in this workspace</span>
                </p>
                <progress
                  className="sv-progress mt-2"
                  value={g.xpIntoLevel}
                  max={g.xpForNextLevel}
                  aria-label="Level progress"
                />
                <small>{g.xpForNextLevel - g.xpIntoLevel} XP to the next level</small>
                <p className="mt-3 text-xs">
                  {me.user.showStreak
                    ? `${g.streakDays} day streak · best ${g.longestStreak} days`
                    : 'Streak display is off.'}
                </p>
                <Link className="sv-link mt-2 inline-block text-xs" to="/achievements">
                  {g.achievements.filter((a) => a.unlocked).length} badges · activity history →
                </Link>
              </>
            ) : (
              <p className="mt-2 text-xs">{game.isError ? 'Could not load XP.' : 'Loading XP…'}</p>
            )}
          </div>
          <div className="sv-atlas-side">
            <p className="sv-kicker">
              <Sparkles size={14} /> Personal quests
            </p>
            {trail.quests.map((q) => (
              <div className="mt-3" key={q.period}>
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-65">
                  {q.period} · {q.points} XP {q.earned ? '· earned' : ''}
                </p>
                <p className="my-1 text-sm">{q.title}</p>
                <progress
                  className="sv-progress"
                  value={q.progress}
                  max={q.target}
                  aria-label={`${q.period} quest`}
                />
                <small>
                  {q.progress}/{q.target} · resets {q.end.slice(0, 10)} UTC
                </small>
              </div>
            ))}
          </div>
          <div className="sv-atlas-side">
            <p className="sv-kicker">
              <ShieldCheck size={14} /> Upcoming checkpoint
            </p>
            <h3 className="mt-2 text-sm font-semibold">{here ? CHAPTER_BRIEFS[here.stage] : 'Archived'}</h3>
            <p className="mt-1 text-xs">
              {here?.ready ? 'Evidence is ready to review.' : here?.missing.slice(0, 3).join(' · ')}
            </p>
            <hr className="my-3 opacity-30" />
            <p className="text-sm">
              Product health <b>{health.score}/100</b>
            </p>
            <Link className="sv-link text-xs" to={root + '/overview'}>
              See product metrics →
            </Link>
          </div>
          {me.workspace.mode !== 'solo' && (
            <div className="sv-atlas-side">
              <p className="sv-kicker">Team contribution</p>
              <p className="mt-2 text-xs">
                World progress is shared. Rewards belong to the person who did the work.
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {collab.data.team.slice(0, 4).map((m) => (
                  <li key={m.userId}>
                    <strong>{m.name}</strong> · {m.completed}/{m.assigned} assigned activities completed
                  </li>
                ))}
              </ul>
              <Link className="sv-link text-xs" to={`${root}/journey?stage=${p.stage}`}>
                Review all assignments →
              </Link>
            </div>
          )}
          <div className="sv-atlas-side">
            <p className="sv-kicker">Tools &amp; records</p>
            <nav className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-sm" aria-label="Related product tools">
              {[
                ['discover?stage=' + p.stage + '&view=brief', 'Briefs'],
                ['tasks', 'Tasks'],
                ['costs', 'Cost sheet'],
                ['materials', 'BOM'],
                ['cad', '3D CAD'],
                ['improve', 'Insights']
              ].map(([tab, text]) => (
                <Link className="sv-link" key={tab} to={`${root}/${tab}`}>
                  {text}
                </Link>
              ))}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
