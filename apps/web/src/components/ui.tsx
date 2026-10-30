import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from 'react';
import { Loader2, X } from 'lucide-react';
import { getStage } from '@sv/shared';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// ── Buttons ────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-[#16598d] text-white hover:bg-[#124c79] active:bg-[#103e65] shadow-sm disabled:bg-[#16598d]/60',
  secondary:
    'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
  danger: 'bg-rose-600 text-white hover:bg-rose-500 shadow-sm'
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60',
        size === 'sm' ? 'min-h-8 px-3 py-1.5 text-xs' : 'min-h-10 px-4 py-2 text-sm',
        variants[variant],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
        className
      )}
      {...rest}
    />
  );
}

// ── Form fields ────────────────────────────────────────────────────────────

const fieldBase =
  'w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(fieldBase, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(fieldBase, 'min-h-[80px] resize-y', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(fieldBase, 'pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p> : hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

/** Money/number input that commits on blur or Enter, so typing never fires a request per keystroke. */
export function CommitInput({
  value,
  onCommit,
  prefix,
  type = 'number',
  min = 0,
  step = 'any',
  placeholder,
  className,
  ariaLabel,
  allowEmpty = false
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  prefix?: string;
  type?: 'number';
  min?: number;
  step?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  allowEmpty?: boolean;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  useEffect(() => setDraft(value === null ? '' : String(value)), [value]);
  const commit = () => {
    if (draft.trim() === '') {
      if (allowEmpty && value !== null) onCommit(null);
      else if (!allowEmpty) setDraft(value === null ? '' : String(value));
      return;
    }
    const n = Number(draft);
    if (!Number.isFinite(n) || n < min) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    if (n !== value) onCommit(n);
  };
  return (
    <div className={cx('relative', className)}>
      {prefix && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">{prefix}</span>}
      <input
        aria-label={ariaLabel}
        type={type}
        inputMode="decimal"
        min={min}
        step={step}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(value === null ? '' : String(value));
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={cx(fieldBase, 'tabular-nums', prefix && 'pl-8')}
      />
    </div>
  );
}

// ── Surfaces ───────────────────────────────────────────────────────────────

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-lg border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,36,60,0.03)] dark:border-zinc-800 dark:bg-zinc-900/60', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <div className="mt-0.5 text-zinc-400">{icon}</div>}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-6 sm:flex-row sm:items-center sm:justify-between md:px-8 dark:border-zinc-800 dark:bg-zinc-900/40">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/70 px-6 py-12 dark:bg-zinc-900/30 text-center dark:border-zinc-700">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-zinc-500">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[200px] items-center justify-center gap-2 text-sm text-zinc-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label}…
    </div>
  );
}

export function ProgressBar({ value, className, tone = 'indigo' }: { value: number; className?: string; tone?: 'indigo' | 'emerald' | 'amber' | 'rose' }) {
  const color = { indigo: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }[tone];
  return (
    <div
      className={cx('h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800', className)}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

const stageColors: Record<string, { dot: string; badge: string }> = {
  zinc: { dot: 'bg-zinc-400', badge: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300 border-zinc-500/20' },
  sky: { dot: 'bg-sky-500', badge: 'bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/20' },
  blue: { dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' },
  indigo: { dot: 'bg-blue-500', badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20' },
  violet: { dot: 'bg-violet-500', badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20' },
  amber: { dot: 'bg-amber-500', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20' },
  emerald: { dot: 'bg-emerald-500', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
  teal: { dot: 'bg-teal-500', badge: 'bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-500/20' },
  rose: { dot: 'bg-rose-500', badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20' }
};

export function stageStyle(stage: string) {
  return stageColors[getStage(stage).color];
}

export function StageBadge({ stage }: { stage: string }) {
  const s = getStage(stage);
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium', stageStyle(stage).badge)}>
      <span className={cx('h-1.5 w-1.5 rounded-full', stageStyle(stage).dot)} />
      {s.label}
    </span>
  );
}

export function GradeBadge({ grade, score }: { grade: string; score: number }) {
  const tone =
    grade === 'A'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
      : grade === 'B'
        ? 'bg-sky-500/10 text-sky-700 dark:text-sky-400'
        : grade === 'C'
          ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400';
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', tone)} title={`Product health ${score}/100`}>
      {grade} · {score}
    </span>
  );
}

// ── Modal ──────────────────────────────────────────────────────────────────

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'md'
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className={cx(
          'animate-rise flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-zinc-200 bg-white shadow-2xl sm:rounded-2xl dark:border-zinc-800 dark:bg-zinc-900',
          size === 'sm' ? 'sm:max-w-md' : size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-xl'
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 id={id} className="font-semibold">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p>}
          </div>
          <IconButton label="Close" data-close onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 bg-zinc-50/60 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-900">{footer}</div>}
      </div>
    </div>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmCtx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title}
          size="sm"
          onClose={() => close(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button variant={state.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                {state.confirmLabel ?? 'Confirm'}
              </Button>
            </>
          }
        >
          <div className="text-sm text-zinc-600 dark:text-zinc-400">{state.body}</div>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm outside ConfirmProvider');
  return ctx;
}
