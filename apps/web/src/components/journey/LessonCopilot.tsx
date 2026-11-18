import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ChevronDown, Send, Sparkles } from 'lucide-react';
import type { AnswerValue, Product, Question } from '@sv/shared';
import { post } from '../../api/client';
import { Button, Input } from '../ui';

type Reply = { source: 'guide' | 'ai'; text: string; next: { href: string; title: string } };
export function LessonCopilot({
  product,
  q,
  draft,
  onUse,
  disabled
}: {
  disabled: boolean;
  product: Product;
  q: Question;
  draft: AnswerValue;
  onUse: (s: string) => void;
}) {
  const [message, setMessage] = useState('');
  const ask = useMutation({
    mutationFn: (text: string) =>
      post<Reply>(`/products/${product.id}/lessons/${q.key}/assist`, { message: text, draft })
  });
  return (
    <details className="group rounded-xl border border-[#cddfe2] bg-[#f3f9f9] dark:border-zinc-700 dark:bg-zinc-900">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm font-semibold">
        <Sparkles size={18} className="text-teal-700 dark:text-teal-400" /> Founder copilot{' '}
        <ChevronDown size={16} className="ml-auto group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-[#d6e3e4] p-5 dark:border-zinc-700">
        <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
          Ask about this activity. Asking shares a short excerpt of this product and your draft with your workspace’s
          configured AI, if available. Suggestions never change the record.
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            'Why does this matter?',
            ...(typeof draft === 'string' && draft.trim() ? ['Help rewrite my draft'] : []),
            'What should I do next?'
          ].map((text) => (
            <Button key={text} variant="secondary" size="sm" disabled={ask.isPending} onClick={() => ask.mutate(text)}>
              {text}
            </Button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (message.trim() && !ask.isPending) ask.mutate(message);
          }}
        >
          <Input
            aria-label="Ask the founder copilot"
            maxLength={800}
            placeholder="Ask a question…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            loading={ask.isPending}
            disabled={!message.trim()}
            aria-label="Send question"
          >
            <Send size={16} />
          </Button>
        </form>
        {ask.isPending && (
          <p role="status" className="text-xs text-zinc-500">
            Checking your product context…
          </p>
        )}
        {ask.isError && (
          <p role="alert" className="text-sm text-rose-600">
            {ask.error.message} You can still use the example and save your answer.
          </p>
        )}
        {ask.data && (
          <div
            className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950"
            aria-live="polite"
          >
            <p className="sv-kicker">
              {ask.data.source === 'ai' ? 'AI suggestion · review before use' : 'Built-in guide · no AI generated'}
            </p>
            <p className="my-3 whitespace-pre-wrap break-words text-sm leading-6">{ask.data.text}</p>
            {ask.data.source === 'ai' && ['text', 'longtext'].includes(q.type) && (
              <Button variant="secondary" size="sm" disabled={disabled} onClick={() => onUse(ask.data!.text)}>
                Copy to my draft for editing
              </Button>
            )}
            {ask.variables?.toLowerCase().includes('next') && (
              <Link className="sv-link block text-sm" to={ask.data.next.href}>
                {ask.data.next.title} →
              </Link>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
