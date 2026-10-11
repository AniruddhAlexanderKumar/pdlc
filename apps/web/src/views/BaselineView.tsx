import React, { useState, useEffect } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { api } from '../lib/api';

interface BaselineViewProps {
  projectId: string;
}

export const BaselineView: React.FC<BaselineViewProps> = ({ projectId }) => {
  const [baselines, setBaselines] = useState<any[]>([]);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [baselineName, setBaselineName] = useState('');
  const [baselineType, setBaselineType] = useState('Functional');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Compare state
  const [baselineA, setBaselineA] = useState('');
  const [baselineB, setBaselineB] = useState('');
  const [comparisonDiff, setComparisonDiff] = useState<any | null>(null);

  const loadBaselines = async () => {
    try {
      const data = await api.getBaselines(projectId);
      setBaselines(data);
      if (data.length >= 2) {
        setBaselineA(data[0].id);
        setBaselineB(data[1].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadBaselines();
  }, [projectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.createBaseline({
        projectId,
        name: baselineName,
        type: baselineType,
        description,
      });
      setIsCreateOpen(false);
      setBaselineName('');
      setDescription('');
      await loadBaselines();
    } catch (err: any) {
      alert(`Error creating baseline: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompare = async () => {
    if (!baselineA || !baselineB) return;
    try {
      const diff = await api.compareBaselines(baselineA, baselineB);
      setComparisonDiff(diff);
    } catch (err: any) {
      alert(`Error comparing baselines: ${err.message}`);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Configuration Baselines"
        subtitle="Immutable freeze-frame snapshots of requirements, architecture, verification, and risks."
        icon="[BSL]"
        color="text-purple-400"
        actions={
          <button
            onClick={() => setIsCreateOpen(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold px-3 py-1.5 transition-colors"
          >
            + ESTABLISH BASELINE
          </button>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 overflow-hidden">
        {/* Baselines Table */}
        <div className="glass-panel p-5 rounded-xl flex flex-col overflow-hidden">
          <div className="font-mono text-xs text-purple-400 mb-3 border-b border-surface-800 pb-2">
            Established Configuration Baselines ({baselines.length})
          </div>
          <div className="flex-1 overflow-y-auto space-y-3">
            {baselines.map((b) => (
              <div
                key={b.id}
                className="p-4 bg-surface-900 border border-surface-800 rounded-lg flex flex-col gap-1.5"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-purple-400">{b.id}</span>
                    <span className="text-[10px] font-mono text-surface-400 px-1.5 py-0.5 border border-surface-700">
                      {b.type}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-surface-500">
                    {new Date(b.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm font-bold text-white">{b.name}</div>
                {b.description && <div className="text-xs text-surface-300">{b.description}</div>}
                <div className="text-[10px] text-surface-500 font-mono mt-1">
                  Established by: {b.createdBy}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Baseline Comparison Diff Panel */}
        <div className="glass-panel p-5 rounded-xl flex flex-col overflow-hidden">
          <div className="font-mono text-xs text-brand mb-3 border-b border-surface-800 pb-2">
            Baseline Comparison (Field-Level Audit Diff)
          </div>

          <div className="flex gap-2 mb-4">
            <select
              value={baselineA}
              onChange={(e) => setBaselineA(e.target.value)}
              className="flex-1 bg-surface-900 border border-surface-700 text-xs font-mono text-white p-2 focus:outline-none"
            >
              <option value="">-- Baseline A --</option>
              {baselines.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} ({b.name})
                </option>
              ))}
            </select>
            <select
              value={baselineB}
              onChange={(e) => setBaselineB(e.target.value)}
              className="flex-1 bg-surface-900 border border-surface-700 text-xs font-mono text-white p-2 focus:outline-none"
            >
              <option value="">-- Baseline B --</option>
              {baselines.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.id} ({b.name})
                </option>
              ))}
            </select>
            <button
              onClick={handleCompare}
              className="px-4 py-2 bg-brand text-black font-mono text-xs font-bold hover:bg-brand-hover"
            >
              COMPARE
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 bg-surface-950 p-3 border border-surface-800">
            {!comparisonDiff && (
              <div className="p-8 text-center font-mono text-xs text-surface-500">
                Select two baselines and click Compare to evaluate configuration variance.
              </div>
            )}

            {comparisonDiff && (
              <div>
                <div className="text-xs font-mono text-white mb-2">
                  Comparing <span className="text-brand">{comparisonDiff.baselineA.id}</span> vs{' '}
                  <span className="text-brand">{comparisonDiff.baselineB.id}</span>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">
                    Added Requirements: {comparisonDiff.requirementsDiff.added.length}
                  </div>
                  {comparisonDiff.requirementsDiff.added.map((item: any) => (
                    <div key={item.id} className="p-2 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono">
                      + [{item.id}] {item.text}
                    </div>
                  ))}

                  <div className="text-[10px] font-mono text-surface-400 uppercase tracking-widest mt-2">
                    Changed Requirements: {comparisonDiff.requirementsDiff.changed.length}
                  </div>
                  {comparisonDiff.requirementsDiff.changed.map((item: any) => (
                    <div key={item.id} className="p-2 bg-amber-500/10 border border-amber-500/30 text-xs font-mono space-y-1">
                      <div className="text-amber-400 font-bold">~ [{item.id}] Modified:</div>
                      <div className="text-red-400 line-through">Before: {item.before.text}</div>
                      <div className="text-emerald-400">After: {item.after.text}</div>
                    </div>
                  ))}

                  {comparisonDiff.requirementsDiff.added.length === 0 &&
                    comparisonDiff.requirementsDiff.changed.length === 0 &&
                    comparisonDiff.requirementsDiff.removed.length === 0 && (
                      <div className="text-xs font-mono text-emerald-400 p-3">
                        ✓ Exact Match: Zero configuration drift detected between these baselines.
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Baseline Modal */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="glass-panel w-full max-w-lg bg-surface-900 border border-purple-500/40 p-6 flex flex-col gap-4"
          >
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider border-b border-surface-800 pb-2">
              Establish Configuration Baseline
            </h3>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Baseline Name
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Critical Design Review (CDR) Baseline"
                value={baselineName}
                onChange={(e) => setBaselineName(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Baseline Classification
              </label>
              <select
                value={baselineType}
                onChange={(e) => setBaselineType(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
              >
                <option value="Functional">Functional Baseline</option>
                <option value="Allocated">Allocated Baseline</option>
                <option value="Product">Product Baseline</option>
                <option value="Release">Release Baseline</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                Description / Authorization Scope
              </label>
              <textarea
                rows={2}
                placeholder="Formally authorized snapshot at lifecycle milestone..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-mono font-bold px-4 py-2"
              >
                {submitting ? 'Freezing Snapshot...' : 'Freeze Baseline Snapshot'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
