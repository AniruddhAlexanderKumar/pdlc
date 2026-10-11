import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { StatusBadge } from './StatusBadge';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult: (tab: string, id: string) => void;
  projectId: string;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectResult,
  projectId,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.search(query, projectId);
        setResults(res.results || []);
      } catch (e) {
        console.error('Search error', e);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, projectId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start justify-center pt-20 px-4">
      <div className="glass-panel w-full max-w-2xl bg-surface-900 border border-surface-700 shadow-2xl p-4 flex flex-col">
        <div className="flex items-center gap-3 border-b border-surface-800 pb-3">
          <span className="text-brand font-mono text-xs">SEARCH //</span>
          <input
            type="text"
            placeholder="Search requirements, architecture, tests, risks, NCs, change requests..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
            className="flex-1 bg-transparent text-sm font-mono text-white placeholder-surface-500 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-white font-mono text-xs px-2 py-1 bg-surface-800 border border-surface-700"
          >
            ESC
          </button>
        </div>

        <div className="mt-3 max-h-96 overflow-y-auto space-y-1">
          {loading && (
            <div className="p-4 text-center font-mono text-xs text-surface-400">
              Querying engineering records...
            </div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="p-4 text-center font-mono text-xs text-surface-500">
              No matching engineering artifacts found for "{query}".
            </div>
          )}

          {!loading &&
            results.map((item, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onSelectResult(item.link, item.id);
                  onClose();
                }}
                className="p-3 bg-surface-950/60 border border-surface-800 hover:border-brand/40 hover:bg-surface-800 cursor-pointer flex items-center justify-between transition-colors"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-800 text-surface-400 border border-surface-700">
                    {item.type}
                  </span>
                  <span className="font-mono text-xs font-bold text-white shrink-0">
                    {item.id}
                  </span>
                  <span className="text-xs text-surface-300 truncate">{item.title}</span>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
