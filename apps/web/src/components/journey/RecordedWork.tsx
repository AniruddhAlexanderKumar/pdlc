import { useState } from 'react';
import { Link } from 'react-router';
import type { Question, WorkSource, AnswerValue } from '@sv/shared';
import { Button } from '../ui';
/** Local file selection is a proposal. The browser reads text only; there is no upload, parser service or automatic save. */
export async function readNote(file: File, max: number) {
  if (!/\.(txt|md)$/i.test(file.name) || file.size > 40_000)
    throw Error('Choose a plain .txt or .md note under 40 KB.');
  const text = (await file.text()).trim();
  if (!text || text.includes('\0') || text.length > max)
    throw Error(`Choose a text excerpt of 1–${max} characters.`);
  return text;
}
export function RecordedWork({
  q,
  sources,
  onUse,
  disabled
}: {
  q: Question;
  sources: WorkSource[];
  onUse: (v: AnswerValue) => void;
  disabled: boolean;
}) {
  const [item, setItem] = useState<{ label: string; text: string } | null>(null),
    [error, setError] = useState('');
  const choices = sources.filter((s) => s.keys.includes(q.key));
  const canUse = ['text', 'longtext', 'evidence', 'ranked', 'money'].includes(q.type);
  const apply = () => {
    if (!item) return;
    const text = item.text;
    if (q.type === 'evidence') onUse(['Founder assumption', text.slice(0, 2000), item.label]);
    else if (q.type === 'ranked')
      onUse(
        text
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(0, 12)
          .map((s) => s.slice(0, 200))
      );
    else if (q.type === 'money') {
      const n = Number(text);
      if (!Number.isFinite(n) || n < 0) return setError('Enter the amount from the source in the exercise.');
      onUse(n);
    } else onUse(text.slice(0, q.type === 'text' ? 300 : 5000));
  };
  return (
    <details className="sv-inset my-4 p-4 text-sm">
      <summary className="cursor-pointer font-semibold">
        Use existing work {choices.length ? `· ${choices.length} related records` : ''}
      </summary>
      <p className="my-2 text-xs text-zinc-500">
        Read a source before using it. A linked file, task or note is not proof of an interview, build trial or
        test result.
      </p>
      <ul className="space-y-2">
        {choices.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className="sv-link"
              onClick={() => {
                setItem({ label: s.label, text: s.excerpt });
                setError('');
              }}
            >
              Inspect {s.label}
            </button>
            {s.href && (
              <Link className="sv-link ml-2 text-xs" to={s.href}>
                Open record ↗
              </Link>
            )}
          </li>
        ))}
      </ul>
      {canUse && (
        <label className="mt-3 block text-xs">
          Read a local text excerpt (.txt / .md)
          <input
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            className="mt-1 block w-full"
            disabled={disabled}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                const text = await readNote(f, q.type === 'text' ? 300 : q.type === 'evidence' ? 2000 : 5000);
                setItem({ label: f.name, text });
                setError('');
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          />
        </label>
      )}
      {item && (
        <div className="mt-3">
          <p className="font-semibold">{item.label}</p>
          <blockquote className="my-2 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs">
            {item.text}
          </blockquote>
          {canUse && (
            <Button size="sm" variant="secondary" disabled={disabled} onClick={apply}>
              Use excerpt in my draft
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs">
          {error}
        </p>
      )}
    </details>
  );
}
