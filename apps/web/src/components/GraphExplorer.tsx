import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import type { GraphAnswer, GraphNode } from '@sv/shared';
import { get, post } from '../api/client';
import { useSession } from '../api/hooks';
import { Button, Input, Textarea } from './ui';

interface Props {
  projectId: string; selectedIssueId?: string;
  onIssue: (id: string) => void; onProject: (id: string) => void;
  onNode: (id: string) => boolean;
}

/** Search is database-backed. The assistant classifies requests, but results are calculated on the server. */
export function GraphExplorer({projectId, selectedIssueId, onIssue, onProject, onNode}: Props) {
  const { demo } = useSession();
  const [tab, setTab] = useState<'search' | 'assistant' | null>(null);
  const [text, setText] = useState(''); const [debounced, setDebounced] = useState(''); const [question, setQuestion] = useState('');
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(text.trim()), 300); return () => window.clearTimeout(timer); }, [text]);
  const search = useQuery({
    queryKey: ['graph-search', projectId, debounced], enabled: tab === 'search' && debounced.length >= 2,
    queryFn: () => get<{nodes: GraphNode[]; truncated: boolean}>(`/teamwork-graph/search?q=${encodeURIComponent(debounced)}${projectId ? `&projectId=${projectId}` : ''}`)
  });
  const ask = useMutation({ mutationFn: (q: string) => post<GraphAnswer>('/teamwork-graph/ask', { question: q, ...(projectId ? {projectId} : {}), ...(selectedIssueId ? {selectedIssueId} : {}) }) });
  const submit = (e: FormEvent) => { e.preventDefault(); if (question.trim()) ask.mutate(question.trim()); };
  return <div className="relative flex gap-2">
    <button type="button" aria-expanded={tab === 'search'} onClick={() => setTab(tab === 'search' ? null : 'search')} className="rounded-md border border-blue-200 px-2 py-2 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:text-blue-300">Search workspace</button>
    {!demo && <button type="button" aria-expanded={tab === 'assistant'} onClick={() => setTab(tab === 'assistant' ? null : 'assistant')} className="rounded-md border border-blue-200 px-2 py-2 text-xs font-semibold text-blue-700 dark:border-blue-900 dark:text-blue-300">Ask graph</button>}
    {tab && <section className="absolute left-0 top-full z-40 mt-2 max-h-[70vh] w-[min(92vw,420px)] overflow-auto rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-700 dark:bg-zinc-900" aria-label={tab === 'search' ? 'Workspace graph search' : 'Graph assistant'}>
      <div className="mb-3 flex justify-between"><h2 className="text-sm font-semibold">{tab === 'search' ? 'Find a record' : 'Ask the graph'}</h2><button aria-label="Close panel" onClick={() => setTab(null)}><X className="h-4 w-4" aria-hidden="true" /></button></div>
      {tab === 'search' ? <><Input autoFocus aria-label="Find workspace records" placeholder="Name, issue key or ID" value={text} onChange={e => setText(e.target.value)} /><p className="mt-2 text-xs text-zinc-500">Searches {projectId ? 'this project' : 'the workspace'}, including records outside the current canvas.</p>
        {search.isFetching && <p className="mt-3 text-xs text-zinc-500">Searching…</p>}{search.isError && <p role="alert" className="mt-3 text-xs text-rose-600">{search.error.message}</p>}
        {search.data?.nodes.map(n => <div key={n.id} className="mt-2 rounded-lg border border-zinc-100 p-2 dark:border-zinc-800"><p className="text-xs font-semibold text-blue-600">{n.type}{n.key ? ` · ${n.key}` : ''}</p><p className="text-sm">{n.title}</p><div className="mt-1 flex gap-3 text-xs text-blue-600">{n.type === 'issue' ? <button onClick={() => {onIssue(n.recordId); setTab(null);}}>Explore connections</button> : n.type === 'project' ? <button onClick={() => {onProject(n.recordId); setTab(null);}}>Open project graph</button> : <button onClick={() => {if (onNode(n.id)) setTab(null);}}>Show if loaded</button>}<Link to={n.url}>Open record</Link></div></div>)}
        {search.data && !search.data.nodes.length && <p className="mt-3 text-sm text-zinc-500">No matching records.</p>}{search.data?.truncated && <p className="mt-3 text-xs text-amber-600">Some results were omitted. Use a more specific search.</p>}</> : <><p className="text-xs leading-5 text-zinc-500">The configured AI interprets your question; answers are calculated from recorded issues and dependencies. It cannot create relationships.</p><form onSubmit={submit} className="mt-3 space-y-2"><Textarea autoFocus aria-label="Question for graph assistant" value={question} onChange={e => setQuestion(e.target.value)} maxLength={500} rows={3} placeholder="What is blocking this project?" /><Button type="submit" size="sm" disabled={question.trim().length < 3} loading={ask.isPending}>Ask</Button></form>
        {ask.isError && <p role="alert" className="mt-3 text-xs text-rose-600">{ask.error.message}</p>}
        {ask.data && <div aria-live="polite"><p className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">{ask.data.explanation}</p>{ask.data.findings.length === 0 && ask.data.intent !== 'unsupported' && <p className="mt-2 text-xs text-zinc-500">No matching records found.</p>}{ask.data.findings.map((f, index) => <div key={`${f.id}-${index}`} className="mt-2 rounded-lg border border-zinc-100 p-2 dark:border-zinc-800"><p className="text-xs font-semibold text-blue-600">{f.key} · {f.reason}</p><p className="text-sm">{f.title}</p><p className="text-xs text-zinc-500">{f.status} · {f.priority}</p>{f.supporting && <p className="mt-1 text-xs text-zinc-500">Supporting record: <Link className="text-blue-600" to={f.supporting.url}>{f.supporting.key} · {f.supporting.title}</Link></p>}<div className="mt-1 flex gap-3 text-xs text-blue-600"><button onClick={() => {onIssue(f.id); setTab(null);}}>Explore connections</button><Link to={f.url}>Open record</Link></div></div>)}{ask.data.truncated && <p className="mt-2 text-xs text-amber-600">Only the first 50 matches are shown.</p>}</div>}</>}
    </section>}
  </div>;
}
