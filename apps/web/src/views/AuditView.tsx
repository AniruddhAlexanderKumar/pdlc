import React, { useState, useEffect } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { api } from '../lib/api';

interface AuditViewProps {
  projectId: string;
}

export const AuditView: React.FC<AuditViewProps> = ({ projectId }) => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAudit = async () => {
    setLoading(true);
    try {
      const data = await api.getAuditEvents(projectId);
      setEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAudit();
  }, [projectId]);

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Authoritative Audit Trail & System Ledger"
        subtitle="Immutable historical audit records tracking all engineering actions, actors, and state transitions."
        icon="[AUD]"
        color="text-surface-300"
        actions={
          <button
            onClick={loadAudit}
            className="px-3 py-1.5 bg-surface-900 border border-surface-700 text-xs font-mono text-surface-300 hover:text-white"
          >
            REFRESH LEDGER
          </button>
        }
      />

      <div className="flex-1 glass-panel p-6 rounded-xl overflow-y-auto space-y-2">
        <div className="font-mono text-xs text-surface-400 mb-3 border-b border-surface-800 pb-2 flex justify-between">
          <span>EVENT LEDGER ({events.length} Captured Events)</span>
          <span>POSTGRESQL AUDIT TABLE</span>
        </div>

        {loading && (
          <div className="p-8 text-center font-mono text-xs text-surface-500">
            Fetching immutable audit ledger...
          </div>
        )}

        {!loading &&
          events.map((evt) => (
            <div
              key={evt.id}
              className="p-3 bg-surface-900 border border-surface-800 rounded font-mono text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 hover:border-surface-700 transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-surface-500 shrink-0">
                  {new Date(evt.timestamp).toLocaleString()}
                </span>
                <span className="text-brand font-bold shrink-0">[{evt.action}]</span>
                <span className="text-surface-400 shrink-0">
                  {evt.objectType} // {evt.objectId}
                </span>
                {evt.details && (
                  <span className="text-surface-300 truncate text-[11px] max-w-md">
                    {evt.details}
                  </span>
                )}
              </div>
              <div className="text-right shrink-0 text-[10px] text-surface-500">
                Actor: {evt.actorEmail}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
