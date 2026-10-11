import React, { useState } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

interface RiskViewProps {
  risks: any[];
  requirements: any[];
  architecture: any[];
  projectId: string;
  onRefresh: () => void;
}

export const RiskView: React.FC<RiskViewProps> = ({
  risks,
  requirements,
  architecture,
  projectId,
  onRefresh,
}) => {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [cause, setCause] = useState('');
  const [consequence, setConsequence] = useState('');
  const [severity, setSeverity] = useState('Medium');
  const [likelihood, setLikelihood] = useState('Possible');
  const [mitigation, setMitigation] = useState('');
  const [linkedReq, setLinkedReq] = useState('');
  const [linkedSys, setLinkedSys] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createRisk({
        projectId,
        title,
        cause,
        consequence,
        severity,
        likelihood,
        mitigation,
        linkedReq: linkedReq || null,
        linkedSys: linkedSys || null,
      });
      setIsCreateOpen(false);
      setTitle('');
      setCause('');
      setConsequence('');
      setMitigation('');
      onRefresh();
    } catch (err: any) {
      alert(`Error creating risk: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async (riskId: string, status: string) => {
    try {
      await api.updateRisk(riskId, { status });
      onRefresh();
    } catch (err: any) {
      alert(`Error updating risk: ${err.message}`);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Risk & Safety Management"
        subtitle="System hazard identification, probability/severity scoring, and mitigation tracking."
        icon="[RSK]"
        color="text-sys-risk"
        actions={
          <button
            onClick={() => setIsCreateOpen(true)}
            className="bg-sys-risk hover:bg-red-600 text-white text-xs font-mono font-bold px-3 py-1.5 transition-colors"
          >
            + LOG TECHNICAL RISK
          </button>
        }
      />

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 overflow-y-auto pb-6">
        {risks.map((risk) => {
          const req = requirements.find((r) => r.id === risk.linkedReq);
          const sys = architecture.find((a) => a.id === risk.linkedSys);

          return (
            <div
              key={risk.id}
              className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col hover:border-sys-risk/40 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sys-risk bg-sys-risk/10 px-2 py-0.5 border border-sys-risk/30">
                    {risk.id}
                  </span>
                  <StatusBadge status={risk.severity} />
                  <span className="text-[10px] font-mono text-surface-400">
                    Score: {risk.ratingScore} (Likelihood: {risk.likelihood})
                  </span>
                </div>
                <StatusBadge status={risk.status} />
              </div>

              <h3 className="text-sm font-bold text-white mb-2">{risk.title}</h3>

              {risk.cause && (
                <div className="text-xs text-surface-300 mb-1">
                  <span className="text-surface-500 font-mono">Cause: </span>
                  {risk.cause}
                </div>
              )}
              {risk.consequence && (
                <div className="text-xs text-surface-300 mb-3">
                  <span className="text-surface-500 font-mono">Consequence: </span>
                  {risk.consequence}
                </div>
              )}

              {/* Linked objects */}
              <div className="flex gap-2 mb-3">
                {req && (
                  <span className="text-[10px] font-mono text-sys-req bg-sys-req/10 px-2 py-0.5 border border-sys-req/30">
                    Req: {req.id}
                  </span>
                )}
                {sys && (
                  <span className="text-[10px] font-mono text-sys-arch bg-sys-arch/10 px-2 py-0.5 border border-sys-arch/30">
                    Sys: {sys.id}
                  </span>
                )}
              </div>

              {risk.mitigation && (
                <div className="bg-surface-900/60 p-2.5 rounded border border-surface-800 text-xs text-surface-300 mb-3">
                  <span className="text-[10px] text-emerald-400 font-mono font-bold block mb-0.5">
                    MITIGATION PLAN:
                  </span>
                  {risk.mitigation}
                </div>
              )}

              <div className="mt-auto pt-3 border-t border-surface-800 flex justify-between items-center">
                <span className="text-[10px] text-surface-500 font-mono">
                  Owner: {risk.mitigationOwner || 'Unassigned'}
                </span>
                <div className="flex gap-2">
                  {risk.status === 'Open' && (
                    <button
                      onClick={() => handleUpdateStatus(risk.id, 'Mitigated')}
                      className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-mono font-bold hover:bg-emerald-500/20"
                    >
                      Mark Mitigated
                    </button>
                  )}
                  {risk.status === 'Mitigated' && (
                    <button
                      onClick={() => handleUpdateStatus(risk.id, 'Closed')}
                      className="px-2 py-1 bg-surface-800 text-surface-300 border border-surface-700 text-[10px] font-mono hover:text-white"
                    >
                      Close Risk
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Log Risk Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-sys-risk/40 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              Log Technical & Safety Hazard
            </h3>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Risk Statement
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Motor Thermal Overload at Peak Dynamics"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Severity
                </label>
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Likelihood
                </label>
                <select
                  value={likelihood}
                  onChange={(e) => setLikelihood(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="Rare">Rare</option>
                  <option value="Unlikely">Unlikely</option>
                  <option value="Possible">Possible</option>
                  <option value="Likely">Likely</option>
                  <option value="Almost Certain">Almost Certain</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Link to Requirement
              </label>
              <select
                value={linkedReq}
                onChange={(e) => setLinkedReq(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              >
                <option value="">-- None --</option>
                {requirements.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.id} - {r.text}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Link to Architecture Component
              </label>
              <select
                value={linkedSys}
                onChange={(e) => setLinkedSys(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              >
                <option value="">-- None --</option>
                {architecture.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Mitigation Strategy
              </label>
              <textarea
                rows={2}
                placeholder="Engineering controls or safeguards..."
                value={mitigation}
                onChange={(e) => setMitigation(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-surface-800">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="px-3 py-1.5 text-xs font-mono text-surface-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-sys-risk hover:bg-red-600 text-white text-xs font-mono font-bold px-4 py-2"
              >
                {submitting ? 'Logging...' : 'Save Risk Record'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
