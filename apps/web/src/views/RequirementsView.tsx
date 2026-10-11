import React, { useState } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

interface RequirementsViewProps {
  requirements: any[];
  architecture: any[];
  verification: any[];
  risks: any[];
  projectId: string;
  onRefresh: () => void;
  selectedId?: string | null;
  onSelectId?: (id: string | null) => void;
}

export const RequirementsView: React.FC<RequirementsViewProps> = ({
  requirements,
  architecture,
  verification,
  risks,
  projectId,
  onRefresh,
  selectedId: propSelectedId,
  onSelectId,
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedId = propSelectedId !== undefined ? propSelectedId : internalSelectedId;
  const setSelectedId = onSelectId || setInternalSelectedId;

  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Form state
  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState('Functional');
  const [newRationale, setNewRationale] = useState('');
  const [newAllocatedTo, setNewAllocatedTo] = useState('');
  const [newMethod, setNewMethod] = useState('Test');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const selectedReq = requirements.find((r) => r.id === selectedId);
  const allocation = architecture.find((a) => a.id === selectedReq?.allocatedTo);
  const linkedTests = verification.filter((v) => v.reqId === selectedReq?.id);
  const linkedRisks = risks.filter((r) => r.linkedReq === selectedReq?.id);

  const filteredRequirements = requirements.filter((r) => {
    if (filterType !== 'ALL' && r.type !== filterType) return false;
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    return true;
  });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFeedback(null);
    try {
      await api.createRequirement({
        projectId,
        text: newText,
        type: newType,
        rationale: newRationale,
        allocatedTo: newAllocatedTo || null,
        verificationMethod: newMethod,
      });
      setIsCreateOpen(false);
      setNewText('');
      setNewRationale('');
      onRefresh();
    } catch (err: any) {
      setFeedback(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (reqId: string, status: string) => {
    try {
      await api.updateRequirementStatus(reqId, status);
      onRefresh();
    } catch (err: any) {
      alert(`Error updating status: ${err.message}`);
    }
  };

  const handleAllocate = async (reqId: string, archId: string) => {
    try {
      await api.updateRequirement(reqId, { allocatedTo: archId || null });
      onRefresh();
    } catch (err: any) {
      alert(`Error allocating requirement: ${err.message}`);
    }
  };

  return (
    <div className="flex h-full animate-slide-in overflow-hidden">
      {/* Main Table Panel */}
      <div className="flex-1 p-6 flex flex-col h-full overflow-hidden">
        <SectionHeader
          title="Requirements Engineering"
          subtitle="Author, allocate, and establish bidirectional lifecycle traceability."
          icon="[REQ]"
          color="text-sys-req"
          actions={
            <div className="flex items-center gap-3">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-surface-900 border border-surface-700 text-xs font-mono text-surface-200 px-2 py-1.5 focus:outline-none"
              >
                <option value="ALL">All Types</option>
                <option value="Physical">Physical</option>
                <option value="Performance">Performance</option>
                <option value="Safety">Safety</option>
                <option value="Interface">Interface</option>
                <option value="Functional">Functional</option>
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="bg-surface-900 border border-surface-700 text-xs font-mono text-surface-200 px-2 py-1.5 focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="In Review">In Review</option>
                <option value="Approved">Approved</option>
                <option value="Baselined">Baselined</option>
              </select>

              <button
                onClick={() => setIsCreateOpen(true)}
                className="bg-sys-req hover:bg-purple-600 text-white text-xs font-mono font-bold px-3 py-1.5 transition-colors flex items-center gap-1.5"
              >
                + NEW REQUIREMENT
              </button>
            </div>
          }
        />

        <div className="flex-1 glass-panel rounded-xl flex flex-col overflow-hidden">
          <div className="grid grid-cols-12 gap-4 p-3 border-b border-white/10 bg-surface-900/50 text-[10px] font-bold text-surface-400 uppercase tracking-wider font-mono">
            <div className="col-span-2">ID // REV</div>
            <div className="col-span-5">Statement</div>
            <div className="col-span-2">Allocation (PBS)</div>
            <div className="col-span-1">Method</div>
            <div className="col-span-2 text-right">Status</div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredRequirements.map((req) => (
              <div
                key={req.id}
                onClick={() => setSelectedId(req.id)}
                className={`grid grid-cols-12 gap-4 p-3 data-row cursor-pointer items-center transition-colors ${
                  selectedId === req.id
                    ? 'bg-sys-req/10 border-l-2 border-sys-req'
                    : 'border-l-2 border-transparent'
                }`}
              >
                <div className="col-span-2 font-mono text-[11px] font-bold text-sys-req flex items-center gap-1.5">
                  <span>{req.id}</span>
                  <span className="text-[9px] text-surface-500 font-normal">r{req.revision}</span>
                </div>
                <div className="col-span-5 text-sm text-surface-200 truncate pr-4">
                  {req.text}
                </div>
                <div className="col-span-2 text-xs font-mono text-sys-arch truncate">
                  {req.allocatedTo || (
                    <span className="text-amber-500/80 text-[10px]">[UNALLOCATED]</span>
                  )}
                </div>
                <div className="col-span-1 text-[11px] text-surface-400 font-mono">
                  {req.verificationMethod}
                </div>
                <div className="col-span-2 text-right">
                  <StatusBadge status={req.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Side Traceability & Quality Drawer */}
      {selectedReq && (
        <div className="w-96 border-l border-white/10 bg-surface-900/90 p-6 overflow-y-auto shadow-2xl flex flex-col animate-slide-in">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-bold text-sys-req bg-sys-req/10 px-2 py-0.5 border border-sys-req/30">
                {selectedReq.id}
              </span>
              <span className="text-xs font-mono text-surface-400">rev {selectedReq.revision}</span>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="text-surface-400 hover:text-white font-mono text-xs"
            >
              [X]
            </button>
          </div>

          <div className="mb-4">
            <h3 className="text-sm font-medium text-white mb-2 leading-relaxed">
              {selectedReq.text}
            </h3>
            {selectedReq.rationale && (
              <p className="text-[11px] text-surface-400 italic bg-black/40 p-2.5 border border-surface-800">
                Rationale: {selectedReq.rationale}
              </p>
            )}
          </div>

          {/* Lifecycle Status Controls */}
          <div className="mb-6 p-3 bg-black/60 border border-surface-800">
            <div className="text-[10px] font-mono text-surface-400 uppercase tracking-widest mb-2 flex justify-between">
              <span>Lifecycle State:</span>
              <StatusBadge status={selectedReq.status} />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {selectedReq.status === 'Draft' && (
                <button
                  onClick={() => handleStatusChange(selectedReq.id, 'In Review')}
                  className="px-2 py-1 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 text-[10px] font-mono font-bold"
                >
                  Submit Review
                </button>
              )}
              {selectedReq.status === 'In Review' && (
                <button
                  onClick={() => handleStatusChange(selectedReq.id, 'Approved')}
                  className="px-2 py-1 bg-brand/10 text-brand hover:bg-brand/20 border border-brand/30 text-[10px] font-mono font-bold"
                >
                  Approve
                </button>
              )}
              {selectedReq.status === 'Approved' && (
                <button
                  onClick={() => handleStatusChange(selectedReq.id, 'Baselined')}
                  className="px-2 py-1 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/30 text-[10px] font-mono font-bold"
                >
                  Freeze Baseline
                </button>
              )}
            </div>
          </div>

          {/* Allocation Selector */}
          <div className="mb-6">
            <h4 className="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1 flex items-center justify-between font-mono">
              <span>PBS Allocation</span>
              <span className="text-sys-arch">[SYS]</span>
            </h4>
            <select
              value={selectedReq.allocatedTo || ''}
              onChange={(e) => handleAllocate(selectedReq.id, e.target.value)}
              className="w-full bg-surface-800 border border-surface-700 text-xs font-mono text-white p-2 mb-2 focus:outline-none"
            >
              <option value="">-- Unallocated (Architecture Deficit) --</option>
              {architecture.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.id} - {a.name} ({a.type})
                </option>
              ))}
            </select>
            {allocation ? (
              <div className="bg-surface-800/80 p-3 rounded border border-sys-arch/30">
                <div className="text-[11px] font-mono text-sys-arch font-bold">{allocation.id}</div>
                <div className="text-xs text-white">{allocation.name}</div>
                <div className="text-[10px] text-surface-400 uppercase mt-0.5">{allocation.type}</div>
              </div>
            ) : (
              <div className="text-xs text-amber-400 p-2.5 bg-amber-400/10 border border-amber-400/20 font-mono">
                ! Unallocated - Architecture Deficit
              </div>
            )}
          </div>

          {/* Verification Evidence */}
          <div className="mb-6">
            <h4 className="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1 flex items-center justify-between font-mono">
              <span>Verification Evidence</span>
              <span className="text-sys-verify">[V&V]</span>
            </h4>
            {linkedTests.length > 0 ? (
              linkedTests.map((t) => (
                <div
                  key={t.id}
                  className={`bg-surface-800/80 p-3 rounded border mb-2 ${
                    t.status === 'Passed'
                      ? 'border-emerald-500/30'
                      : t.status === 'Failed'
                      ? 'border-red-500/30'
                      : 'border-surface-700'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono text-xs font-bold text-white">{t.id}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-xs text-surface-300 mb-1">{t.name}</div>
                  {t.resultSummary && (
                    <div className="text-[10px] text-surface-400 font-mono bg-black/40 p-1.5 border border-surface-800">
                      &gt; {t.resultSummary}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-xs text-amber-400 p-2.5 bg-amber-400/10 border border-amber-400/20 font-mono">
                ! No verification procedures linked
              </div>
            )}
          </div>

          {/* Linked Risks */}
          {linkedRisks.length > 0 && (
            <div className="mb-6">
              <h4 className="text-[10px] font-bold text-surface-500 uppercase tracking-widest mb-2 border-b border-white/5 pb-1 flex items-center justify-between font-mono">
                <span>Linked Hazards & Risks</span>
                <span className="text-sys-risk">[RSK]</span>
              </h4>
              {linkedRisks.map((r) => (
                <div key={r.id} className="bg-surface-800/80 p-3 rounded border border-sys-risk/30 mb-2">
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-mono text-xs font-bold text-sys-risk">{r.id}</span>
                    <StatusBadge status={r.severity} />
                  </div>
                  <div className="text-xs text-white">{r.title}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-surface-700 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              + Author New Requirement
            </h3>

            {feedback && (
              <div className="p-2.5 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-mono">
                {feedback}
              </div>
            )}

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">
                  What must the product achieve?
                </label>
                <span className="text-[9px] font-mono text-surface-500">
                  Tip: Use normative phrasing like "shall" or "must"
                </span>
              </div>
              <textarea
                required
                rows={3}
                placeholder="e.g. The flight actuator assembly shall complete full 45mm stroke transit in less than 0.80 seconds under 5.0 kN opposing dynamic load."
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 font-mono focus:outline-none focus:border-sys-req"
              />
              {/* Plain-Language Assistant Feedback */}
              {newText.length > 5 && (
                <div className="mt-2 p-2 bg-surface-950/80 border border-surface-800 rounded text-[11px] font-mono">
                  {/(adequate|fast|lightweight|sufficient|suitable|reasonable)/i.test(newText) ? (
                    <div className="text-amber-400 flex items-start gap-1.5">
                      <span className="font-bold">! Ambiguous Goal Detected: </span>
                      <span>
                        Words like "fast" or "lightweight" cannot be verified. Specify exact numerical limits (e.g. "&lt; 0.8s" or "&lt; 2.2 kg").
                      </span>
                    </div>
                  ) : !/(shall|must|will)/i.test(newText) ? (
                    <div className="text-surface-400 flex items-start gap-1.5">
                      <span className="text-brand font-bold">&bull; Recommendation: </span>
                      <span>
                        Professional aerospace requirements typically use "The [system] shall [action]" for contractual clarity.
                      </span>
                    </div>
                  ) : (
                    <div className="text-emerald-400 flex items-start gap-1.5">
                      <span className="font-bold">&check; Well-Formed Requirement: </span>
                      <span>Contains normative mandate and measurable criteria suitable for verification.</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Type
                </label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="Functional">Functional</option>
                  <option value="Physical">Physical</option>
                  <option value="Performance">Performance</option>
                  <option value="Safety">Safety</option>
                  <option value="Interface">Interface</option>
                  <option value="Environmental">Environmental</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Verification Method
                </label>
                <select
                  value={newMethod}
                  onChange={(e) => setNewMethod(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="Test">Test</option>
                  <option value="Inspection">Inspection</option>
                  <option value="Analysis">Analysis</option>
                  <option value="Demonstration">Demonstration</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Allocate to PBS Element
              </label>
              <select
                value={newAllocatedTo}
                onChange={(e) => setNewAllocatedTo(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              >
                <option value="">-- Select Element (Optional) --</option>
                {architecture.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} - {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Engineering Context & Rationale
              </label>
              <input
                type="text"
                placeholder="Derived from..."
                value={newRationale}
                onChange={(e) => setNewRationale(e.target.value)}
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
                className="bg-sys-req hover:bg-purple-600 text-white text-xs font-mono font-bold px-4 py-1.5"
              >
                {submitting ? 'Persisting...' : 'Save Requirement'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
