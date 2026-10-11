import React, { useState } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

interface QualityViewProps {
  nonconformances: any[];
  projectId?: string;
  onRefresh: () => void;
}

export const QualityView: React.FC<QualityViewProps> = ({
  nonconformances,
  onRefresh,
}) => {
  const [closingNcId, setClosingNcId] = useState<string | null>(null);
  const [closureEvidence, setClosureEvidence] = useState('');
  const [correctiveAction, setCorrectiveAction] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const selectedNc = nonconformances.find((n) => n.id === closingNcId);

  const handleClose = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!closingNcId) return;
    setSubmitting(true);
    try {
      await api.closeNonconformance(closingNcId, {
        closureEvidence,
        correctiveAction,
      });
      setClosingNcId(null);
      setClosureEvidence('');
      setCorrectiveAction('');
      onRefresh();
    } catch (err: any) {
      alert(`Closure error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Quality & Nonconformance Management"
        subtitle="Containment, root-cause investigation, disposition, and verified corrective action closure."
        icon="[NC]"
        color="text-amber-400"
        actions={
          <span className="text-[10px] font-mono text-surface-400">
            {nonconformances.filter((n) => n.status !== 'Closed').length} Open Nonconformance(s)
          </span>
        }
      />

      <div className="space-y-4 overflow-y-auto pb-6 flex-1">
        {nonconformances.map((nc) => (
          <div
            key={nc.id}
            className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col hover:border-amber-400/30 transition-colors"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 border border-amber-400/30">
                  {nc.id}
                </span>
                <span className="text-[10px] font-mono text-surface-400 border border-surface-700 px-1.5 py-0.5">
                  Severity: {nc.severity}
                </span>
                {nc.linkedVrf && (
                  <span className="text-[10px] font-mono text-sys-verify bg-sys-verify/10 px-1.5 py-0.5 border border-sys-verify/30">
                    Linked to {nc.linkedVrf}
                  </span>
                )}
              </div>
              <StatusBadge status={nc.status} />
            </div>

            <h3 className="text-sm font-bold text-white mb-2">{nc.title}</h3>
            <p className="text-xs text-surface-300 mb-3">{nc.description}</p>

            {nc.containmentActions && (
              <div className="bg-surface-900/80 p-2.5 rounded border border-surface-800 text-xs mb-2">
                <span className="text-[10px] text-amber-400 font-mono font-bold block mb-0.5">
                  CONTAINMENT ACTIONS:
                </span>
                <span className="text-surface-300">{nc.containmentActions}</span>
              </div>
            )}

            {nc.rootCause && (
              <div className="bg-surface-900/80 p-2.5 rounded border border-surface-800 text-xs mb-2">
                <span className="text-[10px] text-brand font-mono font-bold block mb-0.5">
                  ROOT CAUSE ANALYSIS:
                </span>
                <span className="text-surface-300">{nc.rootCause}</span>
              </div>
            )}

            {nc.closureEvidence && (
              <div className="bg-emerald-950/20 p-2.5 rounded border border-emerald-500/30 text-xs mb-2">
                <span className="text-[10px] text-emerald-400 font-mono font-bold block mb-0.5">
                  VERIFIED CLOSURE EVIDENCE:
                </span>
                <span className="text-emerald-200">{nc.closureEvidence}</span>
              </div>
            )}

            <div className="mt-auto pt-3 border-t border-surface-800 flex justify-between items-center">
              <span className="text-[10px] text-surface-500 font-mono">
                Reported By: {nc.reportedBy} | Assigned: {nc.assignedTo || 'Unassigned'}
              </span>

              {nc.status !== 'Closed' && (
                <button
                  onClick={() => {
                    setClosingNcId(nc.id);
                    setCorrectiveAction(nc.correctiveAction || '');
                  }}
                  className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-mono font-bold hover:bg-emerald-500/30 transition-colors"
                >
                  DISPOSITION & CLOSE NC
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Close NC Dialog */}
      {closingNcId && selectedNc && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <form
            onSubmit={handleClose}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-emerald-500/40 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              Formal Nonconformance Disposition & Closure
            </h3>

            <div className="text-xs font-mono text-surface-300">
              Closing <span className="text-amber-400 font-bold">{selectedNc.id}</span>: {selectedNc.title}
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Corrective Action Implemented
              </label>
              <textarea
                required
                rows={2}
                placeholder="Describe corrective changes implemented..."
                value={correctiveAction}
                onChange={(e) => setCorrectiveAction(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Verified Closure Evidence (Mandatory)
              </label>
              <textarea
                required
                rows={3}
                placeholder="Documented test evidence, re-test report ID, calibration cert..."
                value={closureEvidence}
                onChange={(e) => setClosureEvidence(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-surface-800">
              <button
                type="button"
                onClick={() => setClosingNcId(null)}
                className="px-3 py-1.5 text-xs font-mono text-surface-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold px-4 py-2"
              >
                {submitting ? 'Verifying Closure...' : 'SUBMIT VERIFIED CLOSURE'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
