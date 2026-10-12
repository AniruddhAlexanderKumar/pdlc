import React, { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  GitPullRequestArrow,
  Layers,
  ListChecks,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import DraggableWidgetGrid, {
  type WidgetItem,
} from '@/components/ui/draggable-widget-grid';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';

/**
 * Reference implementation of `@/components/ui/draggable-widget-grid`: the
 * engineering control center as a board of draggable, resizable tiles bound to
 * authoritative project telemetry (`GET /api/v1/projects/:id/telemetry`).
 *
 * The widget order is persisted locally, so an engineer's board survives
 * reloads and tab switches.
 */

/** The reference demo (simulated agent-observability data) loads on demand. */
const ReferenceBoard = lazy(
  () => import('@/components/ui/draggable-widget-grid-demo')
);

type BoardKind =
  | 'project'
  | 'gate'
  | 'coverage'
  | 'baseline'
  | 'verification'
  | 'risks'
  | 'ncs'
  | 'ecrs'
  | 'criteria'
  | 'evidence'
  | 'next';

export interface BoardWidget extends WidgetItem {
  kind: BoardKind;
}

/**
 * Default arrangement: 11 tiles, 16 cells, so the grid's exact tiler fills a
 * gap-free 4 × 4 rectangle at the default column count.
 */
export const DEFAULT_BOARD: BoardWidget[] = [
  { id: 'project', kind: 'project', size: 'wide', label: 'Project identity' },
  { id: 'gate', kind: 'gate', size: 'sm', label: 'Release gate readiness' },
  { id: 'coverage', kind: 'coverage', size: 'sm', label: 'Requirement allocation' },
  { id: 'baseline', kind: 'baseline', size: 'sm', label: 'Baselining maturity' },
  { id: 'verification', kind: 'verification', size: 'wide', label: 'Verification ledger' },
  { id: 'risks', kind: 'risks', size: 'sm', label: 'Open high risks' },
  { id: 'ncs', kind: 'ncs', size: 'sm', label: 'Open nonconformances' },
  { id: 'ecrs', kind: 'ecrs', size: 'sm', label: 'Open change requests' },
  { id: 'criteria', kind: 'criteria', size: 'lg', label: 'Stage gate criteria' },
  { id: 'evidence', kind: 'evidence', size: 'sm', label: 'Gate evidence coverage' },
  { id: 'next', kind: 'next', size: 'sm', label: 'Recommended next step' },
];

const STORAGE_KEY = 'nexgen.widget-board.layout.v1';

/** Restores a saved order, ignoring ids this board no longer defines. */
function restoreBoard(): BoardWidget[] {
  if (typeof window === 'undefined') return DEFAULT_BOARD;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_BOARD;
    const saved = JSON.parse(raw) as WidgetItem[];
    if (!Array.isArray(saved) || saved.length !== DEFAULT_BOARD.length)
      return DEFAULT_BOARD;
    const byId = new Map(DEFAULT_BOARD.map((w) => [w.id, w]));
    const seen = new Set<string>();
    const order: BoardWidget[] = [];
    for (const entry of saved) {
      const widget = byId.get(String(entry?.id));
      if (!widget || seen.has(widget.id)) return DEFAULT_BOARD;
      seen.add(widget.id);
      order.push(widget);
    }
    return order;
  } catch {
    return DEFAULT_BOARD;
  }
}

/* ------------------------------------------------------------------ *
 * Tile building blocks (theme tokens: bg-card, text-muted-foreground, …)
 * ------------------------------------------------------------------ */

const TONE: Record<string, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  err: 'bg-red-500',
  idle: 'bg-muted-foreground/60',
  accent: 'bg-brand',
};

const TEXT: Record<string, string> = {
  ok: 'text-emerald-400',
  warn: 'text-amber-400',
  err: 'text-red-400',
  idle: 'text-muted-foreground',
  accent: 'text-brand',
};

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

const Frame: React.FC<{
  title: string;
  meta?: React.ReactNode;
  icon: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, meta, icon, children }) => (
  <section className="@container flex h-full min-h-0 flex-col p-4">
    <header className="flex items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-widest">
      <span className="flex min-w-0 items-center gap-2 truncate text-muted-foreground">
        {icon}
        {title}
      </span>
      {meta && <span className="shrink-0 text-muted-foreground">{meta}</span>}
    </header>
    <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
  </section>
);

const Figure: React.FC<{ children: React.ReactNode; unit?: string }> = ({
  children,
  unit,
}) => (
  <p className="font-mono text-[26px] leading-none tracking-tight tabular-nums text-foreground @[260px]:text-[30px]">
    {children}
    {unit && (
      <span className="text-[12px] text-muted-foreground">
        {'\u00a0'}
        {unit}
      </span>
    )}
  </p>
);

const Meter: React.FC<{ value: number; tone?: keyof typeof TONE }> = ({
  value,
  tone = 'accent',
}) => (
  <span className="block h-[3px] w-full overflow-hidden rounded-full bg-foreground/10">
    <span
      className={`block h-full rounded-full transition-[width] duration-700 motion-reduce:transition-none ${TONE[tone]}`}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </span>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({
  label,
  value,
  tone = 'text-foreground',
}) => (
  <div className="flex items-baseline justify-between gap-3 font-mono text-[11px]">
    <dt className="truncate text-muted-foreground">{label}</dt>
    <dd className={`tabular-nums ${tone}`}>{value}</dd>
  </div>
);

const Jump: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({
  onClick,
  children,
}) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-auto self-start border border-border px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:border-ring hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    {children}
  </button>
);

const Dot: React.FC<{ tone: keyof typeof TONE; pulse?: boolean }> = ({
  tone,
  pulse,
}) => (
  <span aria-hidden="true" className="relative inline-flex size-2 shrink-0">
    {pulse && (
      <span
        className={`absolute inset-0 animate-ping rounded-full opacity-50 motion-reduce:hidden ${TONE[tone]}`}
      />
    )}
    <span className={`relative size-2 rounded-full ${TONE[tone]}`} />
  </span>
);

/* ------------------------------------------------------------------ *
 * Tiles
 * ------------------------------------------------------------------ */

interface TileProps {
  telemetry: any;
  onNavigate: (tab: string) => void;
}

const TILES: Record<BoardKind, React.FC<TileProps>> = {
  project: ({ telemetry, onNavigate }) => {
    const project = telemetry?.project;
    return (
      <Frame
        title="Project identity"
        icon={<Compass className="size-3.5" />}
        meta={project ? <StatusBadge status={project.status || 'Active'} /> : 'offline'}
      >
        <Figure>{project?.id ?? '—'}</Figure>
        <p className="mt-2 truncate font-mono text-[13px] text-foreground">
          {project?.name ?? 'Authoritative source unavailable'}
        </p>
        <dl className="mt-3 space-y-1.5">
          <Stat label="Phase" value={project?.phase ?? '—'} />
          <Stat
            label="Data source"
            value={project ? 'POSTGRESQL 17' : 'API OFFLINE'}
            tone={project ? 'text-emerald-400' : 'text-amber-400'}
          />
        </dl>
        <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">
          {project?.description ?? 'Start the API (npm run dev:api) for live values.'}
        </p>
        <Jump onClick={() => onNavigate('dashboard')}>Control center →</Jump>
      </Frame>
    );
  },

  gate: ({ telemetry, onNavigate }) => {
    const ready = Boolean(telemetry?.isReleaseReady);
    const blockers = telemetry?.blockersCount ?? 0;
    return (
      <Frame
        title="Release gate"
        icon={<Layers className="size-3.5" />}
        meta={ready ? 'cleared' : `${blockers} blockers`}
      >
        <p className="flex items-center gap-2 font-mono text-[15px] font-bold uppercase tracking-wider">
          <Dot tone={ready ? 'ok' : 'err'} pulse={!ready} />
          <span className={TEXT[ready ? 'ok' : 'err']}>
            {telemetry ? (ready ? 'Ready' : 'Blocked') : 'Unknown'}
          </span>
        </p>
        <dl className="mt-3 space-y-1.5">
          <Stat
            label="Mandatory blockers"
            value={blockers}
            tone={blockers > 0 ? 'text-red-400' : 'text-emerald-400'}
          />
          <Stat label="Gate" value="GATE-RELEASE" />
        </dl>
        <Jump onClick={() => onNavigate('release')}>Release gate →</Jump>
      </Frame>
    );
  },

  coverage: ({ telemetry, onNavigate }) => {
    const total = telemetry?.totalReqs ?? 0;
    const allocated = telemetry?.allocatedReqs ?? 0;
    const percent = pct(allocated, total);
    return (
      <Frame
        title="Requirement allocation"
        icon={<Target className="size-3.5" />}
        meta={<span className={TEXT[percent === 100 ? 'ok' : 'warn']}>{percent}%</span>}
      >
        <Figure unit={`of ${total}`}>{allocated}</Figure>
        <div className="mt-3">
          <Meter value={percent} tone={percent === 100 ? 'ok' : 'warn'} />
        </div>
        <dl className="mt-3 space-y-1.5">
          <Stat label="Unallocated" value={Math.max(total - allocated, 0)} />
          <Stat label="PBS elements" value="SYS-001…004" />
        </dl>
        <Jump onClick={() => onNavigate('reqs')}>Traceability →</Jump>
      </Frame>
    );
  },

  baseline: ({ telemetry, onNavigate }) => {
    const total = telemetry?.totalReqs ?? 0;
    const baselined = telemetry?.baselinedReqs ?? 0;
    const percent = pct(baselined, total);
    return (
      <Frame
        title="Baselining maturity"
        icon={<ClipboardCheck className="size-3.5" />}
        meta={`${percent}%`}
      >
        <Figure unit="baselined">{baselined}</Figure>
        <div className="mt-3">
          <Meter value={percent} tone={percent >= 80 ? 'ok' : 'warn'} />
        </div>
        <dl className="mt-3 space-y-1.5">
          <Stat label="Not baselined" value={Math.max(total - baselined, 0)} />
          <Stat label="Approval" value="CCB" />
        </dl>
        <Jump onClick={() => onNavigate('baselines')}>Baselines →</Jump>
      </Frame>
    );
  },

  verification: ({ telemetry, onNavigate }) => {
    const total = telemetry?.totalTests ?? 0;
    const passed = telemetry?.passedTests ?? 0;
    const failed = telemetry?.failedTests ?? 0;
    const rate = pct(passed, total);
    return (
      <Frame
        title="Verification ledger"
        icon={<Activity className="size-3.5" />}
        meta={
          <span className="flex items-center gap-1.5">
            <Dot tone={failed > 0 ? 'err' : 'ok'} pulse={failed === 0} />
            {failed > 0 ? 'failures' : 'nominal'}
          </span>
        }
      >
        <Figure unit={`pass rate · ${total} procedures`}>{rate}%</Figure>
        <dl className="mt-3 space-y-2">
          <div>
            <Stat label="Passed" value={passed} tone={TEXT.ok} />
            <span className="mt-1 block">
              <Meter value={pct(passed, total)} tone="ok" />
            </span>
          </div>
          <div>
            <Stat label="Failed" value={failed} tone={failed > 0 ? TEXT.err : undefined} />
            <span className="mt-1 block">
              <Meter value={pct(failed, total)} tone="err" />
            </span>
          </div>
          <div>
            <Stat label="Awaiting execution" value={Math.max(total - passed - failed, 0)} />
            <span className="mt-1 block">
              <Meter value={pct(Math.max(total - passed - failed, 0), total)} tone="idle" />
            </span>
          </div>
        </dl>
        <Jump onClick={() => onNavigate('verify')}>Execution ledger →</Jump>
      </Frame>
    );
  },

  risks: ({ telemetry, onNavigate }) => {
    const count = telemetry?.highRisks ?? 0;
    return (
      <Frame
        title="Open high risks"
        icon={<ShieldAlert className="size-3.5" />}
        meta="safety matrix"
      >
        <Figure unit="high / critical">{count}</Figure>
        <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <AlertTriangle className={`size-3.5 ${count > 0 ? TEXT.warn : TEXT.ok}`} />
          {count > 0 ? 'Mitigation evidence required' : 'No open high-severity hazards'}
        </p>
        <Jump onClick={() => onNavigate('risk')}>Risk register →</Jump>
      </Frame>
    );
  },

  ncs: ({ telemetry, onNavigate }) => {
    const count = telemetry?.openNCs ?? 0;
    return (
      <Frame
        title="Open nonconformances"
        icon={<XCircle className="size-3.5" />}
        meta="quality"
      >
        <Figure unit="investigations">{count}</Figure>
        <p className="mt-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <Dot tone={count > 0 ? 'err' : 'ok'} />
          {count > 0 ? 'Closure evidence pending' : 'All investigations closed'}
        </p>
        <Jump onClick={() => onNavigate('quality')}>Quality & NC →</Jump>
      </Frame>
    );
  },

  ecrs: ({ telemetry, onNavigate }) => {
    const count = telemetry?.openECRs ?? 0;
    return (
      <Frame
        title="Open change requests"
        icon={<GitPullRequestArrow className="size-3.5" />}
        meta="CCB queue"
      >
        <Figure unit="active ECRs">{count}</Figure>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          Ripple-effect impact traversal automated
        </p>
        <Jump onClick={() => onNavigate('change')}>Change control →</Jump>
      </Frame>
    );
  },

  criteria: ({ telemetry, onNavigate }) => {
    const criteria: any[] = Array.isArray(telemetry?.criteria) ? telemetry.criteria : [];
    return (
      <Frame
        title="Stage gate criteria"
        icon={<ListChecks className="size-3.5" />}
        meta={`${criteria.filter((c) => c.status === 'Met').length}/${criteria.length} met`}
      >
        {criteria.length === 0 ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            Gate evaluation requires an authoritative telemetry response.
          </p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {criteria.map((c) => (
              <li key={c.id} className="flex flex-col gap-1">
                <span className="flex items-center gap-2 font-mono text-[11px]">
                  {c.status === 'Met' ? (
                    <CheckCircle2 className={`size-3.5 shrink-0 ${TEXT.ok}`} />
                  ) : (
                    <XCircle className={`size-3.5 shrink-0 ${TEXT.err}`} />
                  )}
                  <span className="truncate text-foreground">{c.name}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">
                    {c.id}
                  </span>
                </span>
                <span className="line-clamp-2 pl-5 text-[11px] text-muted-foreground">
                  {c.details}
                </span>
              </li>
            ))}
          </ul>
        )}
        <Jump onClick={() => onNavigate('release')}>Gate detail →</Jump>
      </Frame>
    );
  },

  evidence: ({ telemetry }) => {
    const criteria: any[] = Array.isArray(telemetry?.criteria) ? telemetry.criteria : [];
    const mandatory = criteria.filter((c) => c.isMandatory);
    const met = mandatory.filter((c) => c.status === 'Met').length;
    const percent = pct(met, mandatory.length);
    return (
      <Frame
        title="Gate evidence"
        icon={<Sparkles className="size-3.5" />}
        meta={`${percent}%`}
      >
        <Figure unit="mandatory criteria met">
          {met}/{mandatory.length || 0}
        </Figure>
        <div className="mt-3">
          <Meter value={percent} tone={percent === 100 ? 'ok' : 'warn'} />
        </div>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          Evidence is derived from executed verification procedures.
        </p>
      </Frame>
    );
  },

  next: ({ telemetry, onNavigate }) => {
    const failed = telemetry?.failedTests ?? 0;
    const unallocated = Math.max(
      (telemetry?.totalReqs ?? 0) - (telemetry?.allocatedReqs ?? 0),
      0
    );
    const step = failed > 0
      ? { label: 'Investigate failed verification', tab: 'verify' }
      : unallocated > 0
        ? { label: 'Close unallocated requirements', tab: 'reqs' }
        : { label: 'Freeze configuration baseline', tab: 'baselines' };
    return (
      <Frame
        title="Next engineering step"
        icon={<Sparkles className="size-3.5" />}
        meta="guided"
      >
        <p className="font-mono text-[13px] leading-snug text-foreground">
          {telemetry ? step.label.toUpperCase() : 'AWAITING TELEMETRY'}
        </p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {failed > 0
            ? 'A procedure is in a FAILED state; release stays blocked until the root cause is dispositioned.'
            : unallocated > 0
              ? 'Every requirement must be allocated to a PBS element before the gate review.'
              : 'All executed procedures currently pass; an immutable snapshot can be frozen.'}
        </p>
        <Jump onClick={() => onNavigate(step.tab)}>{step.label} →</Jump>
      </Frame>
    );
  },
};

/* ------------------------------------------------------------------ *
 * Board
 * ------------------------------------------------------------------ */

interface WidgetBoardViewProps {
  telemetry: any;
  loading: boolean;
  onNavigate: (tab: string) => void;
}

export const WidgetBoardView: React.FC<WidgetBoardViewProps> = ({
  telemetry,
  loading,
  onNavigate,
}) => {
  const [mode, setMode] = useState<'live' | 'reference'>('live');
  const [board, setBoard] = useState<BoardWidget[]>(() => restoreBoard());
  const [epoch, setEpoch] = useState(0);

  // Tile kind is looked up by id, so a saved order never loses its content.
  const kinds = useMemo(
    () => new Map(DEFAULT_BOARD.map((w) => [w.id, w.kind])),
    []
  );

  const handleChange = useCallback((items: WidgetItem[]) => {
    setBoard(
      items.map((item) => ({
        ...item,
        kind: kinds.get(item.id) ?? 'project',
      })) as BoardWidget[]
    );
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* Storage is optional; the board still works for this session. */
    }
  }, [kinds]);

  const resetLayout = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setBoard(DEFAULT_BOARD);
    setEpoch((n) => n + 1);
  };

  const toggle = (
    <div className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest">
      {(['live', 'reference'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => setMode(option)}
          className={`border px-2.5 py-1 transition-colors ${
            mode === option
              ? 'border-brand/60 bg-brand/10 text-brand'
              : 'border-surface-700 text-surface-400 hover:text-white'
          }`}
        >
          {option === 'live' ? 'Live board' : 'Reference board'}
        </button>
      ))}
      <button
        type="button"
        onClick={resetLayout}
        className="ml-2 flex items-center gap-1.5 border border-surface-700 px-2.5 py-1 text-surface-400 transition-colors hover:text-white"
        title="Restore the default widget arrangement"
      >
        <RotateCcw className="size-3" />
        Reset layout
      </button>
    </div>
  );

  if (mode === 'reference') {
    return (
      <div className="flex-1 min-h-0 flex flex-col bg-black overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-surface-800 px-4 py-2">
          <span className="font-mono text-[10px] uppercase tracking-widest text-surface-400">
            Reference board · simulated agent observability data
          </span>
          {toggle}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Suspense
            fallback={
              <div className="p-8 font-mono text-xs text-surface-400">
                LOADING REFERENCE BOARD…
              </div>
            }
          >
            <ReferenceBoard />
          </Suspense>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-black overflow-hidden">
      <main className="flex-1 min-h-0 overflow-y-auto p-6 animate-slide-in">
        <SectionHeader
          title="Engineering Widget Board"
          subtitle="Drag tiles to rearrange · hold Alt + arrow keys with a tile focused (touch: press and hold)"
          icon="[::]"
          color="text-brand"
          actions={toggle}
        />

        {!loading && !telemetry && (
          <div className="mb-4 flex items-start gap-3 border border-amber-500/40 bg-amber-500/10 px-4 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
            <div className="font-mono text-[11px] leading-relaxed text-amber-200">
              <span className="font-bold uppercase tracking-widest">
                Authoritative telemetry unavailable
              </span>
              <p className="mt-1 text-amber-200/80">
                Start the backend (npm run dev:api) and seed PostgreSQL to populate
                live values. The board stays fully rearrangeable meanwhile — switch
                to the reference board for a complete data preview.
              </p>
            </div>
          </div>
        )}

        <DraggableWidgetGrid
          key={epoch}
          items={board}
          onChange={handleChange}
          editable
          maxColumns={4}
          cellSize={240}
          gap={12}
          radius={22}
          renderItem={(item) => {
            const kind = kinds.get(item.id) ?? 'project';
            const Tile = TILES[kind];
            return <Tile telemetry={telemetry} onNavigate={onNavigate} />;
          }}
        />
      </main>
    </div>
  );
};
