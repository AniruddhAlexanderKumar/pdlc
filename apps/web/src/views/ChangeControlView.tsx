import React, { useState, useEffect } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

interface ChangeControlViewProps {
  requirements: any[];
  architecture?: any[];
  projectId: string;
  onRefresh: () => void;
}

export const ChangeControlView: React.FC<ChangeControlViewProps> = ({
  requirements,
  projectId,
  onRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'ANALYSIS' | 'ECR_LIST' | 'ECO_LIST'>('ANALYSIS');
  const [selectedReqForChange, setSelectedReqForChange] = useState<string | null>(null);
  const [impactData, setImpactData] = useState<any | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);

  // ECR Creation Form
  const [isEcrModalOpen, setIsEcrModalOpen] = useState(false);
  const [ecrTitle, setEcrTitle] = useState('');
  const [ecrReason, setEcrReason] = useState('');
  const [ecrModification, setEcrModification] = useState('');
  const [ecrSeverity, setEcrSeverity] = useState('Class I (Major)');
  const [submittingEcr, setSubmittingEcr] = useState(false);

  // ECRs & ECOs
  const [ecrs, setEcrs] = useState<any[]>([]);
  const [ecos, setEcos] = useState<any[]>([]);

  const loadChanges = async () => {
    try {
      const [ecrData, ecoData] = await Promise.all([
        api.getECRs(projectId),
        api.getECOs(projectId),
      ]);
      setEcrs(ecrData);
      setEcos(ecoData);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadChanges();
  }, [projectId]);

  const handleSelectReq = async (reqId: string) => {
    setSelectedReqForChange(reqId);
    setLoadingImpact(true);
    try {
      const data = await api.getImpactAnalysis({
        projectId,
        targetReqId: reqId,
      });
      setImpactData(data);
      const req = requirements.find((r) => r.id === reqId);
      if (req) {
        setEcrTitle(`Modify ${req.id} Specs`);
        setEcrReason(`Address engineering constraint or performance delta on ${req.id}.`);
        setEcrModification(`Proposed revision to text: ${req.text}`);
      }
    } catch (err: any) {
      alert(`Impact analysis error: ${err.message}`);
    } finally {
      setLoadingImpact(false);
    }
  };

  const handleCreateEcr = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingEcr(true);
    try {
      await api.createECR({
        projectId,
        title: ecrTitle,
        reason: ecrReason,
        proposedModification: ecrModification,
        targetReqId: selectedReqForChange,
        severity: ecrSeverity,
      });
      setIsEcrModalOpen(false);
      setActiveSubTab('ECR_LIST');
      await loadChanges();
      onRefresh();
    } catch (err: any) {
      alert(`Failed to create ECR: ${err.message}`);
    } finally {
      setSubmittingEcr(false);
    }
  };

  const handleApproveEcr = async (ecrId: string) => {
    try {
      await api.approveECR(ecrId);
      await loadChanges();
      onRefresh();
    } catch (err: any) {
      alert(`Approval error: ${err.message}`);
    }
  };

  const handlePromoteEco = async (ecrId: string) => {
    try {
      await api.promoteToECO(ecrId);
      await loadChanges();
      setActiveSubTab('ECO_LIST');
      onRefresh();
    } catch (err: any) {
      alert(`Error creating ECO: ${err.message}`);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Engineering Change Control Board"
        subtitle="Automated ripple effect impact analysis, ECR deliberation, and ECO execution."
        icon="[CCB]"
        color="text-sys-change"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => setActiveSubTab('ANALYSIS')}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase transition-colors ${
                activeSubTab === 'ANALYSIS'
                  ? 'bg-sys-change text-white'
                  : 'bg-surface-900 text-surface-400 hover:text-white border border-surface-800'
              }`}
            >
              Impact Analysis Canvas
            </button>
            <button
              onClick={() => setActiveSubTab('ECR_LIST')}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase transition-colors ${
                activeSubTab === 'ECR_LIST'
                  ? 'bg-sys-change text-white'
                  : 'bg-surface-900 text-surface-400 hover:text-white border border-surface-800'
              }`}
            >
              Change Requests ({ecrs.length})
            </button>
            <button
              onClick={() => setActiveSubTab('ECO_LIST')}
              className={`px-3 py-1.5 text-xs font-mono font-bold uppercase transition-colors ${
                activeSubTab === 'ECO_LIST'
                  ? 'bg-sys-change text-white'
                  : 'bg-surface-900 text-surface-400 hover:text-white border border-surface-800'
              }`}
            >
              Change Orders ({ecos.length})
            </button>
          </div>
        }
      />

      {/* VIEW 1: IMPACT ANALYSIS CANVAS */}
      {activeSubTab === 'ANALYSIS' && (
        <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
          {/* Object Selector */}
          <div className="w-full lg:w-1/3 flex flex-col h-full overflow-hidden">
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-widest mb-3 font-mono">
              Select Object to Modify
            </h3>
            <div className="glass-panel flex-1 rounded-xl p-3 overflow-y-auto space-y-2">
              {requirements.map((req) => (
                <div
                  key={req.id}
                  onClick={() => handleSelectReq(req.id)}
                  className={`p-3.5 border rounded cursor-pointer transition-all ${
                    selectedReqForChange === req.id
                      ? 'border-sys-change bg-sys-change/10 shadow-lg shadow-sys-change/10'
                      : 'border-white/5 bg-surface-900/50 hover:border-white/20'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-mono text-sys-req font-bold">{req.id}</span>
                    <StatusBadge status={req.status} />
                  </div>
                  <div className="text-xs text-surface-200 line-clamp-2">{req.text}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Impact Canvas */}
          <div className="flex-1 glass-panel rounded-xl p-6 relative overflow-hidden flex flex-col border-sys-change/20 bg-surface-950/80">
            {!selectedReqForChange && (
              <div className="m-auto text-center text-surface-500 font-mono">
                <div className="w-16 h-16 rounded-full bg-surface-800 flex items-center justify-center mx-auto mb-4 border border-white/5 text-sys-change text-2xl font-bold">
                  [#]
                </div>
                <p className="text-sm font-medium text-white mb-1">
                  Select a Requirement to run Impact Analysis
                </p>
                <p className="text-xs text-surface-400">
                  Calculates real downstream dependency ripples across the product lifecycle.
                </p>
              </div>
            )}

            {loadingImpact && (
              <div className="m-auto text-center font-mono text-xs text-brand animate-pulse">
                TRAVERSING DEPENDENCY GRAPH IN POSTGRESQL...
              </div>
            )}

            {!loadingImpact && impactData && (
              <div className="animate-slide-in flex-1 overflow-y-auto pr-2">
                {/* Proposed Target */}
                <div className="bg-surface-900 border border-sys-change/40 p-5 rounded-lg mb-6 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-1 h-full bg-sys-change"></div>
                  <div className="text-[10px] text-sys-change font-bold uppercase tracking-widest mb-1.5 font-mono">
                    PROPOSED CHANGE TARGET
                  </div>
                  <div className="font-mono text-sm font-bold text-white mb-1">
                    {impactData.target.id}
                  </div>
                  <div className="text-sm text-surface-300">{impactData.target.title}</div>
                </div>

                <h4 className="text-xs font-bold text-surface-400 uppercase tracking-widest mb-4 flex items-center gap-2 font-mono">
                  <span>Downstream Impact Identified ({impactData.impacts?.length} Nodes)</span>
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {impactData.impacts
                    ?.filter((i: any) => i.impactType !== 'Direct Target')
                    .map((item: any, idx: number) => (
                      <div
                        key={idx}
                        className={`p-4 bg-surface-900 border rounded-lg ${
                          item.impactType === 'Invalidates Verification'
                            ? 'border-sys-verify/40'
                            : item.impactType === 'Re-opens Risk'
                            ? 'border-red-500/40'
                            : 'border-sys-arch/40'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span
                            className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 border ${
                              item.impactType === 'Invalidates Verification'
                                ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                                : item.impactType === 'Re-opens Risk'
                                ? 'text-red-400 border-red-500/40 bg-red-500/10'
                                : 'text-blue-400 border-blue-500/40 bg-blue-500/10'
                            }`}
                          >
                            {item.impactType}
                          </span>
                          <span className="font-mono text-xs font-bold text-white">
                            {item.objectId}
                          </span>
                        </div>
                        <div className="text-xs text-white font-medium mb-1">{item.title}</div>
                        <div className="text-[11px] text-surface-400 font-mono">{item.reason}</div>
                      </div>
                    ))}
                </div>

                <div className="mt-8 pt-4 border-t border-white/10 flex justify-end">
                  <button
                    onClick={() => setIsEcrModalOpen(true)}
                    className="bg-sys-change hover:bg-amber-600 text-white text-xs font-mono font-bold px-6 py-2.5 transition-colors shadow-lg shadow-sys-change/20"
                  >
                    GENERATE ENGINEERING CHANGE REQUEST (ECR)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 2: ECR LIST */}
      {activeSubTab === 'ECR_LIST' && (
        <div className="flex-1 glass-panel rounded-xl p-6 overflow-y-auto space-y-4">
          <div className="font-mono text-xs text-sys-change mb-2 border-b border-surface-800 pb-2">
            Formal Engineering Change Requests Ledger ({ecrs.length})
          </div>
          {ecrs.map((ecr) => (
            <div
              key={ecr.id}
              className="p-4 bg-surface-900 border border-surface-700 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-sys-change">{ecr.id}</span>
                  <span className="text-[10px] font-mono text-surface-400 px-1.5 py-0.5 border border-surface-700">
                    {ecr.severity}
                  </span>
                  <StatusBadge status={ecr.status} />
                </div>
                <div className="text-sm font-bold text-white">{ecr.title}</div>
                <div className="text-xs text-surface-300 mt-1">Reason: {ecr.reason}</div>
                <div className="text-[11px] text-surface-400 font-mono mt-1">
                  Proposed: {ecr.proposedModification}
                </div>
                <div className="text-[10px] text-surface-500 font-mono mt-1">
                  Originator: {ecr.originatorId} | Impacts: {ecr.impacts?.length || 0} items
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {ecr.status === 'Submitted' && (
                  <>
                    <button
                      onClick={() => handleApproveEcr(ecr.id)}
                      className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-xs font-mono font-bold hover:bg-emerald-500/30"
                    >
                      APPROVE ECR
                    </button>
                    <button
                      onClick={async () => {
                        await api.rejectECR(ecr.id);
                        await loadChanges();
                      }}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/40 text-xs font-mono font-bold hover:bg-red-500/30"
                    >
                      REJECT
                    </button>
                  </>
                )}

                {ecr.status === 'Approved' && (
                  <button
                    onClick={() => handlePromoteEco(ecr.id)}
                    className="px-4 py-1.5 bg-brand text-black font-mono text-xs font-bold hover:bg-brand-hover shadow-lg shadow-brand/20"
                  >
                    PROMOTE TO ECO
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW 3: ECO LIST */}
      {activeSubTab === 'ECO_LIST' && (
        <div className="flex-1 glass-panel rounded-xl p-6 overflow-y-auto space-y-4">
          <div className="font-mono text-xs text-brand mb-2 border-b border-surface-800 pb-2">
            Engineering Change Orders (ECO) Authorized Implementation Queue
          </div>
          {ecos.length === 0 && (
            <div className="p-8 text-center font-mono text-xs text-surface-500">
              No Engineering Change Orders authorized yet. Approve an ECR and promote it to create an ECO.
            </div>
          )}
          {ecos.map((eco) => (
            <div
              key={eco.id}
              className="p-4 bg-surface-900 border border-brand/30 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-xs font-bold text-brand">{eco.id}</span>
                  <span className="text-[10px] font-mono text-surface-400">From {eco.ecrId}</span>
                  <StatusBadge status={eco.status} />
                </div>
                <div className="text-sm font-bold text-white">{eco.title}</div>
                <div className="text-xs text-surface-300 mt-1">
                  Authorized Scope: {eco.authorizedScope}
                </div>
                <div className="text-[11px] text-surface-400 font-mono mt-1">
                  Instructions: {eco.implementationInstructions}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create ECR Modal */}
      {isEcrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateEcr}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-sys-change/40 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              Generate Engineering Change Request (ECR)
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  ECR Title
                </label>
                <input
                  required
                  type="text"
                  value={ecrTitle}
                  onChange={(e) => setEcrTitle(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                  Severity Class
                </label>
                <select
                  value={ecrSeverity}
                  onChange={(e) => setEcrSeverity(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                >
                  <option value="Class I (Major)">Class I (Major)</option>
                  <option value="Class II (Minor)">Class II (Minor)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Reason for Engineering Change
              </label>
              <textarea
                required
                rows={2}
                value={ecrReason}
                onChange={(e) => setEcrReason(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Proposed Modification Scope
              </label>
              <textarea
                required
                rows={3}
                value={ecrModification}
                onChange={(e) => setEcrModification(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-surface-800">
              <button
                type="button"
                onClick={() => setIsEcrModalOpen(false)}
                className="px-3 py-1.5 text-xs font-mono text-surface-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingEcr}
                className="bg-sys-change hover:bg-amber-600 text-white text-xs font-mono font-bold px-4 py-2"
              >
                {submittingEcr ? 'Submitting...' : 'Submit ECR to Board'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
