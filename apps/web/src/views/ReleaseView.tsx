import React, { useState, useEffect } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

interface ReleaseViewProps {
  projectId: string;
  onRefresh: () => void;
}

export const ReleaseView: React.FC<ReleaseViewProps> = ({ projectId, onRefresh }) => {
  const [releases, setReleases] = useState<any[]>([]);
  const [gateEvaluation, setGateEvaluation] = useState<any | null>(null);

  // Candidate creation
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const [version, setVersion] = useState('v1.0.0-RC1');
  const [name, setName] = useState('Production Flight Release Candidate 1');
  const [releaseNotes, setReleaseNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Execution feedback
  const [executionError, setExecutionError] = useState<any | null>(null);
  const [executionSuccess, setExecutionSuccess] = useState<any | null>(null);

  const loadData = async () => {
    try {
      const [rels, gateEval] = await Promise.all([
        api.getReleases(projectId),
        api.getGateReadiness(projectId),
      ]);
      setReleases(rels);
      setGateEvaluation(gateEval);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadData();
  }, [projectId]);

  const handleCreateCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createReleaseCandidate({
        projectId,
        version,
        name,
        releaseNotes,
      });
      setIsCandidateModalOpen(false);
      await loadData();
      onRefresh();
    } catch (err: any) {
      alert(`Error creating release candidate: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExecuteRelease = async (releaseId: string) => {
    setExecutionError(null);
    setExecutionSuccess(null);
    try {
      const res = await api.executeRelease(releaseId);
      setExecutionSuccess(res);
      await loadData();
      onRefresh();
    } catch (err: any) {
      setExecutionError(err);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Release & Lifecycle Gate Management"
        subtitle="Mandatory blocker evaluation, configuration freezing, and flight release manifests."
        icon="[REL]"
        color="text-sys-release"
        actions={
          <button
            onClick={() => setIsCandidateModalOpen(true)}
            className="bg-sys-release hover:bg-pink-600 text-white text-xs font-mono font-bold px-3 py-1.5 transition-colors"
          >
            + CREATE RELEASE CANDIDATE
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
        {/* Panel 1: Gate Blocker Evaluation Engine */}
        <div className="glass-panel p-5 rounded-xl flex flex-col overflow-hidden">
          <div className="flex justify-between items-center mb-3 border-b border-surface-800 pb-2">
            <span className="font-mono text-xs text-sys-release font-bold">
              AUTHORITATIVE GATE EVALUATION
            </span>
            {gateEvaluation && (
              <span
                className={`font-mono text-xs font-bold px-2 py-0.5 border ${
                  gateEvaluation.isReady
                    ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                    : 'text-red-400 border-red-500/40 bg-red-500/10'
                }`}
              >
                {gateEvaluation.isReady
                  ? 'CRITERIA MET: READY FOR RELEASE'
                  : `BLOCKED (${gateEvaluation.blockersCount} MANDATORY FAILURES)`}
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {gateEvaluation?.criteria?.map((c: any) => (
              <div
                key={c.id}
                className={`p-3 border rounded ${
                  c.status === 'Met'
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-red-500/10 border-red-500/30'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-mono font-bold uppercase px-1 py-0.5 border ${
                        c.status === 'Met'
                          ? 'text-emerald-400 border-emerald-500/40'
                          : 'text-red-400 border-red-500/40'
                      }`}
                    >
                      {c.status}
                    </span>
                    <span className="font-mono text-xs font-bold text-white">{c.name}</span>
                  </div>
                  {c.isMandatory && (
                    <span className="text-[9px] font-mono text-surface-500 uppercase">
                      Mandatory Blocker
                    </span>
                  )}
                </div>
                <div className="text-xs text-surface-300 mt-1">{c.details}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Panel 2: Release Candidates Ledger */}
        <div className="glass-panel p-5 rounded-xl flex flex-col overflow-hidden">
          <div className="font-mono text-xs text-brand mb-3 border-b border-surface-800 pb-2">
            Release Candidates & Authorized Flight Manifests ({releases.length})
          </div>

          {/* Feedback Banners */}
          {executionError && (
            <div className="p-3 bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-mono mb-3 space-y-1">
              <div className="font-bold">❌ RELEASE DENIED BY SERVER ENGINE:</div>
              <div>{executionError.message}</div>
              {executionError.blockers?.map((b: string, i: number) => (
                <div key={i} className="text-red-400 text-[11px] pl-2 border-l border-red-500/50">
                  • {b}
                </div>
              ))}
            </div>
          )}

          {executionSuccess && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-mono mb-3">
              <div className="font-bold">✓ RELEASE AUTHORIZED & FROZEN!</div>
              <div>
                Version {executionSuccess.version} released by {executionSuccess.releasedBy}.
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-3">
            {releases.length === 0 && (
              <div className="p-8 text-center font-mono text-xs text-surface-500">
                No release candidates created yet. Click "+ Create Release Candidate" to start.
              </div>
            )}

            {releases.map((rel) => (
              <div
                key={rel.id}
                className="p-4 bg-surface-900 border border-surface-800 rounded-lg flex flex-col gap-2"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-sys-release">{rel.id}</span>
                    <span className="font-mono text-xs text-white font-bold">{rel.version}</span>
                    <StatusBadge status={rel.status} />
                  </div>
                  <span className="text-[10px] font-mono text-surface-500">
                    {new Date(rel.createdAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="text-sm font-bold text-white">{rel.name}</div>
                {rel.releaseNotes && (
                  <div className="text-xs text-surface-300 font-mono">{rel.releaseNotes}</div>
                )}

                {rel.manifestData && (
                  <div className="p-2 bg-black/60 border border-surface-800 text-[11px] font-mono text-emerald-400">
                    <div>Manifest Frozen: {rel.manifestData.releasedAt}</div>
                    <div>Sign-off: {rel.manifestData.releasedBy}</div>
                  </div>
                )}

                <div className="pt-2 border-t border-surface-800 flex justify-end">
                  {rel.status === 'Draft' && (
                    <button
                      onClick={() => handleExecuteRelease(rel.id)}
                      className="px-4 py-2 bg-sys-release hover:bg-pink-600 text-white font-mono text-xs font-bold shadow-lg shadow-sys-release/20 transition-colors"
                    >
                      EXECUTE FORMAL RELEASE
                    </button>
                  )}
                  {rel.status === 'Released' && (
                    <span className="text-xs font-mono text-emerald-400 font-bold">
                      ✓ Released Configuration Immutable
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Candidate Modal */}
      {isCandidateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateCandidate}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-sys-release/40 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              Create Release Candidate
            </h3>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Release Version Tag
              </label>
              <input
                required
                type="text"
                placeholder="e.g. v1.0.0-RC1"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Release Candidate Name
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Primary Actuator Engineering Qualification Baseline"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Release Scope & Notes
              </label>
              <textarea
                rows={3}
                placeholder="Qualification scope, airframe applicability, intended test flight series..."
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-surface-800">
              <button
                type="button"
                onClick={() => setIsCandidateModalOpen(false)}
                className="px-3 py-1.5 text-xs font-mono text-surface-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="bg-sys-release hover:bg-pink-600 text-white text-xs font-mono font-bold px-4 py-2"
              >
                {submitting ? 'Generating Candidate...' : 'Create Candidate'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
