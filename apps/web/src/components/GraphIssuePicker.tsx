import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GraphNode } from '@sv/shared';
import { get } from '../api/client';
import { Input } from './ui';

export function GraphIssuePicker({ sourceId, onPick }: { sourceId: string; onPick: (node: GraphNode) => void }) {
  const [text, setText] = useState(''); const [term, setTerm] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setTerm(text.trim()), 300); return () => window.clearTimeout(timer); }, [text]);
  const search = useQuery({ queryKey: ['graph-search', '', term], enabled: term.length >= 2, queryFn: () => get<{nodes: GraphNode[]; truncated: boolean}>(`/teamwork-graph/search?q=${encodeURIComponent(term)}`) });
  const results = search.data?.nodes.filter(n => n.type === 'issue' && n.recordId !== sourceId) ?? [];
  return <div className="mt-3"><label className="block text-xs text-zinc-500">Find another issue in this workspace<Input aria-label="Find issue to link" placeholder="Issue key or name" value={text} onChange={e => setText(e.target.value)} /></label>
    {search.isFetching && <p className="text-xs text-zinc-500">Searching…</p>}{search.isError && <p role="alert" className="text-xs text-rose-600">{search.error.message}</p>}
    <div className="max-h-36 overflow-auto">{results.map(n => <button key={n.id} className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800" onClick={() => {onPick(n); setText('');}}>{n.key} · {n.title}</button>)}</div>
    {search.data && !results.length && <p className="text-xs text-zinc-500">No other issues found.</p>}{search.data?.truncated && <p className="text-xs text-amber-600">Use a more specific search to see more results.</p>}
  </div>;
}
