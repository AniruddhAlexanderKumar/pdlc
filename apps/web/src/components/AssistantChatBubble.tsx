import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router';
import { Bot, Maximize2, Plus, RotateCcw, Send, Sparkles, X } from 'lucide-react';
// @ts-ignore
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
import { get, post } from '../api/client';
import { useSession } from '../api/hooks';
import { cx, Spinner } from './ui';

type Source = { type: 'project' | 'issue' | 'help'; title: string; url: string };
type Message = { id: string; role: 'user' | 'assistant'; content: string; sources: Source[]; created_at: string };
type Conversation = { id: string; title: string; project_id: string | null; project_name: string | null; project_key: string | null };
type ConversationData = { conversation: Conversation; messages: Message[] };

export function AssistantChatBubble() {
  const me = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Don't show on the full /assistant page or in temporary demo workspace
  const isAssistantPage = location.pathname === '/assistant';
  const isDemo = !!me.demo;

  // Conversations list
  const conversations = useQuery({
    queryKey: ['assistant-conversations', me.workspace.id],
    queryFn: () => get<Conversation[]>('/assistant/conversations'),
    enabled: isOpen && !isDemo
  });

  // Automatically pick the latest conversation if none selected
  useEffect(() => {
    if (isOpen && !activeId && conversations.data && conversations.data.length > 0) {
      setActiveId(conversations.data[0].id);
    }
  }, [isOpen, activeId, conversations.data]);

  // Selected conversation data
  const selected = useQuery({
    queryKey: ['assistant-conversation', me.workspace.id, activeId],
    queryFn: () => get<ConversationData>(`/assistant/conversations/${activeId}`),
    enabled: isOpen && !!activeId && !isDemo
  });

  // Auto-scroll to bottom of message list on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [selected.data?.messages, selected.isLoading]);

  // Focus input when chat window opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  const refresh = (cid?: string) => {
    qc.invalidateQueries({ queryKey: ['assistant-conversations', me.workspace.id] });
    qc.invalidateQueries({ queryKey: ['assistant-usage', me.workspace.id] });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['project-issues'] });
    if (cid) {
      qc.invalidateQueries({ queryKey: ['assistant-conversation', me.workspace.id, cid] });
    }
  };

  const send = useMutation({
    mutationFn: async (text: string) => {
      let target = activeId;
      if (!target) {
        const c = await post<Conversation>('/assistant/conversations', { projectId: null });
        target = c.id;
        setActiveId(target);
      }
      await post(`/assistant/conversations/${target}/messages`, { content: text });
      return target;
    },
    onSuccess: (target) => {
      setDraft('');
      setError('');
      refresh(target);
    },
    onError: (e: Error) => {
      setError(e.message);
      refresh(activeId ?? undefined);
    }
  });

  const handleSend = (text: string) => {
    const trimmed = text.trim();
    if (trimmed && !send.isPending) {
      setError('');
      send.mutate(trimmed);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleSend(draft);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend(draft);
    }
  };

  const startNewChat = () => {
    setActiveId(null);
    setDraft('');
    setError('');
  };

  if (isAssistantPage || isDemo) return null;

  const quickPrompts = [
    'List all workspace projects',
    'Show open tasks',
    'Update task status or priority',
    'How do I manage projects?'
  ];

  return (
    <>
      {/* Floating Chat Bubble Button */}
      <div className="fixed bottom-5 right-5 z-40 md:bottom-5 md:right-5">
        <button
          onClick={() => setIsOpen((prev) => !prev)}
          className={cx(
            'group relative flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-all duration-300 active:scale-95',
            isOpen
              ? 'bg-zinc-800 text-white hover:bg-zinc-900 dark:bg-zinc-700 dark:hover:bg-zinc-600'
              : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 hover:shadow-2xl hover:scale-105'
          )}
          aria-label={isOpen ? 'Close AI Assistant' : 'Open AI Assistant'}
          title="AI Assistant (Baidu ERNIE)"
        >
          {isOpen ? (
            <X className="h-6 w-6 transition-transform duration-200 group-hover:rotate-90" />
          ) : (
            <>
              <Sparkles className="h-6 w-6 animate-pulse" />
              {/* Online Green Indicator Dot */}
              <span className="absolute right-0 top-0 flex h-3.5 w-3.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-zinc-900" />
              </span>
            </>
          )}
        </button>
      </div>

      {/* Floating Chat Drawer / Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="AI Assistant"
          className="fixed bottom-24 right-4 z-50 flex h-[560px] w-[380px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-7rem)] flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:w-[420px] dark:border-zinc-800 dark:bg-zinc-900 animate-in fade-in zoom-in-95 duration-200"
        >
          {/* Header */}
          <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-800/60">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI Assistant</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {me.workspace.name} · ERNIE 5.5
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={startNewChat}
                disabled={send.isPending}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-200 disabled:opacity-50"
                title="Start a new chat"
                aria-label="New chat"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  navigate('/assistant');
                }}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-200"
                title="Open full page"
                aria-label="Expand to full page"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-200"
                title="Close"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Messages Scroll Area */}
          <div
            ref={scrollRef}
            className="flex-1 space-y-3.5 overflow-y-auto p-4 text-xs"
            aria-live="polite"
          >
            {/* If empty / starting new chat */}
            {!activeId || (selected.data?.messages.length === 0 && !selected.isLoading) ? (
              <div className="flex h-full flex-col justify-center py-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                  <Bot className="h-6 w-6" />
                </div>
                <h3 className="mt-2.5 font-semibold text-zinc-800 dark:text-zinc-200">How can I help you?</h3>
                <p className="mt-1 text-zinc-500 dark:text-zinc-400">
                  Ask me about projects, create tasks, or update task status and priority.
                </p>

                <div className="mt-4 flex flex-col gap-1.5 text-left">
                  {quickPrompts.map((prompt) => (
                    <button
                      key={prompt}
                      disabled={send.isPending}
                      onClick={() => handleSend(prompt)}
                      className="rounded-lg border border-zinc-200 px-3 py-2 text-left transition hover:border-blue-400 hover:bg-blue-50/50 dark:border-zinc-800 dark:hover:border-blue-500/50 dark:hover:bg-blue-950/30"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Conversation loading */}
            {selected.isLoading && activeId && (
              <div className="py-6 text-center">
                <Spinner label="Loading conversation" />
              </div>
            )}

            {/* Messages */}
            {selected.data?.messages.map((m) => (
              <div
                key={m.id}
                className={cx('flex flex-col', m.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cx(
                    'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-5 whitespace-pre-wrap break-words',
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-none'
                      : 'border border-zinc-200/80 bg-zinc-50/90 text-zinc-800 rounded-bl-none dark:border-zinc-800 dark:bg-zinc-800/70 dark:text-zinc-200'
                  )}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    skipHtml
                    components={{
                      a: ({ children, href }: any) => (
                        <a href={href} target="_blank" rel="noreferrer" className="underline font-medium">
                          {children}
                        </a>
                      ),
                      pre: ({ children }: any) => (
                        <pre className="my-1.5 overflow-x-auto rounded bg-zinc-800 p-2 text-[11px] text-zinc-100 dark:bg-zinc-950">
                          {children}
                        </pre>
                      ),
                      table: ({ children }: any) => (
                        <div className="overflow-x-auto my-1">
                          <table className="border-collapse text-[11px]">{children}</table>
                        </div>
                      ),
                      td: ({ children }: any) => <td className="border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5">{children}</td>,
                      th: ({ children }: any) => <th className="border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 font-semibold">{children}</th>
                    }}
                  >
                    {m.content}
                  </ReactMarkdown>
                </div>

                {/* Sources if present */}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {m.sources.map((s, idx) => (
                      <Link
                        key={idx}
                        to={s.url}
                        className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-blue-600 hover:underline dark:bg-zinc-800 dark:text-blue-400"
                      >
                        {s.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Waiting for reply */}
            {send.isPending && (
              <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 py-1">
                <Spinner label="AI is thinking and executing tools..." />
                <span className="text-[11px]">Thinking & executing tools…</span>
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                {error}
              </div>
            )}
          </div>

          {/* Footer Input */}
          <form
            onSubmit={onSubmit}
            className="shrink-0 border-t border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="relative flex items-end rounded-xl border border-zinc-300 bg-white px-2.5 py-1.5 shadow-sm focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800">
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask or update (e.g. 'mark BUILD-1 as Done')…"
                className="max-h-24 min-h-[28px] w-full resize-none bg-transparent text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
              />
              <button
                type="submit"
                disabled={!draft.trim() || send.isPending}
                className="ml-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:opacity-40"
                aria-label="Send message"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-zinc-400">
              Press Enter to send · Shift+Enter for new line
            </p>
          </form>
        </div>
      )}
    </>
  );
}
