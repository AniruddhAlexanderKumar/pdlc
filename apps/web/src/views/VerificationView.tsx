import React, { useState } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { StatusBadge } from '../components/StatusBadge';
import { api } from '../lib/api';

interface VerificationViewProps {
  verification: any[];
  requirements: any[];
  projectId?: string;
  onRefresh: () => void;
  onNavigateToNC?: (ncId: string) => void;
}

export const VerificationView: React.FC<VerificationViewProps> = ({
  verification,
  requirements,
  onRefresh,
  onNavigateToNC,
}) => {
  const [activeExecuteId, setActiveExecuteId] = useState<string | null>(null);
  const [activeHistoryProc, setActiveHistoryProc] = useState<any | null>(null);

  // Execution Form State
  const [testConfig, setTestConfig] = useState('Metrology Lab Rig #1, ambient 23°C');
  const [witness, setWitness] = useState('Quality Engineer');
  const [outcome, setOutcome] = useState<'Passed' | 'Failed' | 'Inconclusive'>('Passed');
  const [observations, setObservations] = useState('');
  const [deviations, setDeviations] = useState('');
  const [paramName, setParamName] = useState('Measured Parameter');
  const [paramExpected, setParamExpected] = useState('< 0.8s');
  const [paramActual, setParamActual] = useState('0.78s');
  const [paramUnit, setParamUnit] = useState('s');
  const [paramPass, setParamPass] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [executionResultFeedback, setExecutionResultFeedback] = useState<any | null>(null);

  const selectedProcedure = verification.find((v) => v.id === activeExecuteId);

  const handleOpenExecute = (proc: any) => {
    setActiveExecuteId(proc.id);
    setExecutionResultFeedback(null);
    if (proc.id === 'VRF-002') {
      // For dynamic load test default template
      setParamName('Full Stroke Duration');
      setParamExpected('< 0.80 s');
      setParamActual('0.78 s');
      setParamUnit('s');
      setParamPass(true);
      setOutcome('Passed');
      setObservations('Tested with rewound stator coils under 5kN dynamic force. Transit completed in 0.78s.');
    } else {
      setParamName('Standard Parameter');
      setParamExpected(proc.acceptanceCriteria);
      setParamActual('Measured within allowable tolerance');
      setParamUnit('');
      setParamPass(true);
      setOutcome('Passed');
      setObservations('Observations conform to acceptance criteria.');
    }
  };

  const handleExecuteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeExecuteId) return;
    setSubmitting(true);
    try {
      const res = await api.executeTest(activeExecuteId, {
        testConfiguration: testConfig,
        witness,
        outcome,
        measurements: [
          {
            parameter: paramName,
            expected: paramExpected,
            actual: paramActual,
            unit: paramUnit,
            pass: paramPass,
          },
        ],
        observations,
        deviations,
      });

      setExecutionResultFeedback(res);
      onRefresh();
    } catch (err: any) {
      alert(`Execution recording error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenHistory = async (procId: string) => {
    try {
      const fullProc = await api.getVerificationProc(procId);
      setActiveHistoryProc(fullProc);
    } catch (err: any) {
      alert(`Error loading execution history: ${err.message}`);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col animate-slide-in overflow-hidden">
      <SectionHeader
        title="Verification & Validation"
        subtitle="Execute formal procedures and record authoritative empirical evidence against requirements."
        icon="[V&V]"
        color="text-sys-verify"
        actions={
          <span className="text-[10px] font-mono text-surface-400">
            {verification.filter((v) => v.status === 'Passed').length} / {verification.length} Passed
          </span>
        }
      />

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 overflow-y-auto pb-6">
        {verification.map((test) => {
          const req = requirements.find((r) => r.id === test.reqId);
          return (
            <div
              key={test.id}
              className="glass-panel p-5 rounded-xl border border-white/10 flex flex-col hover:border-white/20 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[10px] font-bold text-sys-verify bg-sys-verify/10 px-1.5 py-0.5 rounded border border-sys-verify/20">
                      {test.id}
                    </span>
                    <span className="text-[10px] font-mono text-surface-400 border border-surface-700 px-1.5 py-0.5 rounded">
                      {test.method}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-white">{test.name}</h3>
                </div>
                <StatusBadge status={test.status} />
              </div>

              {/* Verified Requirement Link */}
              <div className="bg-surface-900/50 p-3 rounded flex items-start gap-3 mb-4 flex-1 border border-surface-800">
                <span className="text-surface-500 font-mono text-xs mt-0.5">[LINK]</span>
                <div>
                  <div className="text-[10px] text-surface-500 font-mono mb-0.5">
                    Verifies Requirement: {req?.id}
                  </div>
                  <div className="text-xs text-surface-300 line-clamp-2">{req?.text}</div>
                </div>
              </div>

              {/* Latest Execution Summary */}
              {test.resultSummary && (
                <div className="mb-4">
                  <div className="text-[10px] text-surface-500 uppercase tracking-widest mb-1 font-mono">
                    Latest Execution Evidence
                  </div>
                  <div
                    className={`text-xs font-mono p-2.5 rounded border ${
                      test.status === 'Passed'
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}
                  >
                    &gt; {test.resultSummary}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-auto pt-4 border-t border-white/5 flex justify-between items-center">
                <button
                  onClick={() => handleOpenHistory(test.id)}
                  className="text-surface-400 hover:text-white text-[11px] font-mono underline"
                >
                  View Execution Ledger
                </button>

                <button
                  onClick={() => handleOpenExecute(test)}
                  className="bg-sys-verify hover:bg-emerald-600 text-white text-xs font-mono font-bold px-4 py-2 rounded transition-colors flex items-center gap-1.5 shadow-lg shadow-sys-verify/20"
                >
                  <span>EXECUTE TEST RUN</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Real Test Execution Dialog */}
      {activeExecuteId && selectedProcedure && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <form
            onSubmit={handleExecuteSubmit}
            className="glass-panel w-full max-w-2xl bg-surface-900 border border-sys-verify/40 p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="border-b border-surface-800 pb-3 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-mono text-sys-verify font-bold uppercase tracking-widest">
                  FORMAL TEST EXECUTION RECORDING
                </span>
                <h3 className="text-sm font-mono font-bold text-white mt-1">
                  {selectedProcedure.id}: {selectedProcedure.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveExecuteId(null)}
                className="text-surface-400 hover:text-white font-mono text-xs"
              >
                [X]
              </button>
            </div>

            {executionResultFeedback && (
              <div className="p-3 bg-surface-950 border border-emerald-500/40 text-xs font-mono space-y-1">
                <div className="text-emerald-400 font-bold">
                  ✓ Execution Run #{executionResultFeedback.execution.executionNumber} Recorded!
                </div>
                <div className="text-surface-300">
                  Status: {executionResultFeedback.execution.outcome}
                </div>
                {executionResultFeedback.nonconformance && (
                  <div className="text-red-400 font-bold mt-2 flex items-center justify-between">
                    <span>
                      ! Nonconformance {executionResultFeedback.nonconformance.id} Automatically Triggered and Linked!
                    </span>
                    {onNavigateToNC && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveExecuteId(null);
                          onNavigateToNC(executionResultFeedback.nonconformance.id);
                        }}
                        className="underline text-[10px] text-amber-300 ml-2"
                      >
                        Inspect NC
                      </button>
                    )}
                  </div>
                )}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveExecuteId(null)}
                    className="px-3 py-1 bg-surface-800 text-white text-xs font-mono"
                  >
                    Close Window
                  </button>
                </div>
              </div>
            )}

            {!executionResultFeedback && (
              <>
                <div className="bg-black/50 p-3 border border-surface-800 text-xs font-mono">
                  <span className="text-surface-400">Acceptance Criteria: </span>
                  <span className="text-white">{selectedProcedure.acceptanceCriteria}</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                      Test Rig / Hardware Configuration
                    </label>
                    <input
                      required
                      type="text"
                      value={testConfig}
                      onChange={(e) => setTestConfig(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                      Witness / Quality Inspector
                    </label>
                    <input
                      type="text"
                      value={witness}
                      onChange={(e) => setWitness(e.target.value)}
                      className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                    />
                  </div>
                </div>

                {/* Measurements Entry */}
                <div className="border border-surface-800 p-3 bg-black/40">
                  <div className="text-[10px] font-mono text-surface-400 uppercase tracking-widest mb-2">
                    Empirical Parameter Measurement
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div>
                      <span className="text-[9px] text-surface-500 font-mono block">Parameter</span>
                      <input
                        type="text"
                        value={paramName}
                        onChange={(e) => setParamName(e.target.value)}
                        className="w-full bg-surface-900 border border-surface-700 text-xs text-white p-1 font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-surface-500 font-mono block">Expected Limit</span>
                      <input
                        type="text"
                        value={paramExpected}
                        onChange={(e) => setParamExpected(e.target.value)}
                        className="w-full bg-surface-900 border border-surface-700 text-xs text-white p-1 font-mono"
                      />
                    </div>
                    <div>
                      <span className="text-[9px] text-surface-500 font-mono block">Actual Reading</span>
                      <input
                        type="text"
                        value={paramActual}
                        onChange={(e) => setParamActual(e.target.value)}
                        className="w-full bg-surface-900 border border-surface-700 text-xs text-white p-1 font-mono"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-4">
                      <label className="text-xs font-mono text-surface-300 flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={paramPass}
                          onChange={(e) => setParamPass(e.target.checked)}
                          className="w-4 h-4 bg-surface-900 border border-surface-700"
                        />
                        Pass
                      </label>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                    Formal Outcome Determination
                  </label>
                  <select
                    value={outcome}
                    onChange={(e: any) => setOutcome(e.target.value)}
                    className={`w-full border text-xs p-2 font-mono font-bold focus:outline-none ${
                      outcome === 'Passed'
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/40'
                        : outcome === 'Failed'
                        ? 'bg-red-950/40 text-red-400 border-red-500/40'
                        : 'bg-surface-950 text-white border-surface-700'
                    }`}
                  >
                    <option value="Passed">PASSED - Acceptance Criteria Met</option>
                    <option value="Failed">FAILED - Nonconformance Detected (Triggers NC)</option>
                    <option value="Inconclusive">INCONCLUSIVE - Retest Required</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                    Executor Technical Observations
                  </label>
                  <textarea
                    required
                    rows={2}
                    placeholder="Enter recorded physical telemetry, instrument serial numbers, and observed behaviors..."
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-mono text-surface-400 uppercase tracking-widest block mb-1">
                    Deviations / Anomaly Notes
                  </label>
                  <input
                    type="text"
                    placeholder="None or describe test bench anomalies..."
                    value={deviations}
                    onChange={(e) => setDeviations(e.target.value)}
                    className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2 font-mono focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-surface-800">
                  <button
                    type="button"
                    onClick={() => setActiveExecuteId(null)}
                    className="px-3 py-1.5 text-xs font-mono text-surface-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-sys-verify hover:bg-emerald-600 text-white text-xs font-mono font-bold px-5 py-2 shadow-lg shadow-sys-verify/20"
                  >
                    {submitting ? 'Recording Run...' : 'COMMIT TEST EVIDENCE'}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* Execution Ledger History Modal */}
      {activeHistoryProc && (
        <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-3xl bg-surface-900 border border-surface-700 p-6 flex flex-col max-h-[85vh] overflow-y-auto">
            <div className="border-b border-surface-800 pb-3 flex justify-between items-center mb-4">
              <div>
                <span className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">
                  IMMUTABLE TEST EXECUTION LEDGER
                </span>
                <h3 className="text-sm font-mono font-bold text-white mt-1">
                  {activeHistoryProc.id}: {activeHistoryProc.name}
                </h3>
              </div>
              <button
                onClick={() => setActiveHistoryProc(null)}
                className="text-surface-400 hover:text-white font-mono text-xs"
              >
                [X]
              </button>
            </div>

            <div className="space-y-3">
              {activeHistoryProc.executions?.length === 0 && (
                <div className="p-4 text-center font-mono text-xs text-surface-500">
                  No historical test executions recorded yet.
                </div>
              )}
              {activeHistoryProc.executions?.map((exec: any) => (
                <div
                  key={exec.id}
                  className={`p-4 border bg-black/60 rounded ${
                    exec.outcome === 'Passed'
                      ? 'border-emerald-500/30'
                      : 'border-red-500/30'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-white">
                        Run #{exec.executionNumber}
                      </span>
                      <StatusBadge status={exec.outcome} />
                    </div>
                    <span className="text-[10px] font-mono text-surface-500">
                      {new Date(exec.executedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="text-xs text-surface-300 font-mono mb-2">
                    Config: {exec.testConfiguration} | Executor: {exec.executorId}
                  </div>

                  <div className="p-2 bg-surface-950 border border-surface-800 text-xs font-mono text-surface-200 mb-2">
                    &gt; {exec.observations}
                  </div>

                  {exec.deviations && (
                    <div className="text-[11px] font-mono text-amber-400/90">
                      Deviation: {exec.deviations}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
