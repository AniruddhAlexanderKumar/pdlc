import React from 'react';
import { SectionHeader } from '../components/SectionHeader';

interface DashboardViewProps {
  telemetry: any;
  loading: boolean;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  telemetry,
  loading,
  onNavigate,
}) => {
  if (loading || !telemetry) {
    return (
      <div className="p-8 h-full flex items-center justify-center font-mono text-sm text-surface-400">
        <span className="w-2 h-2 bg-brand animate-ping mr-3"></span>
        STREAMING ENGINEERING TELEMETRY...
      </div>
    );
  }

  const {
    project,
    totalReqs,
    allocatedReqs,
    baselinedReqs,
    totalTests,
    passedTests,
    failedTests,
    highRisks,
    openNCs,
    isReleaseReady,
    criteria = [],
  } = telemetry;

  const allocatedPercent = totalReqs > 0 ? Math.round((allocatedReqs / totalReqs) * 100) : 0;
  const passedPercent = totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0;
  const failedPercent = totalTests > 0 ? Math.round((failedTests / totalTests) * 100) : 0;

  return (
    <div className="p-6 h-full overflow-y-auto animate-slide-in">
      <SectionHeader
        title="Engineering Control Center"
        subtitle={`Project: ${project?.name} | Phase: ${project?.phase} | ID: ${project?.id}`}
        icon="[//]"
        color="text-brand"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">
              Authoritative Source:
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
              POSTGRESQL 17 LIVE
            </span>
          </div>
        }
      />

      {/* Top Telemetry Metric Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* 1. Requirement Allocation */}
        <div
          onClick={() => onNavigate('reqs')}
          className="glass-panel p-5 rounded-xl border-t-2 border-t-sys-req hover:border-sys-req/50 cursor-pointer transition-colors"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-widest">
              Requirement Allocation
            </h3>
            <span className="text-sys-req font-mono text-xs">[REQ]</span>
          </div>
          <div className="flex justify-between items-end mb-2">
            <div className="text-3xl font-mono text-white">{allocatedPercent}%</div>
            <div className="text-xs text-surface-400">Allocated to PBS</div>
          </div>
          <div className="w-full bg-surface-900 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-sys-req h-full transition-all duration-300"
              style={{ width: `${allocatedPercent}%` }}
            ></div>
          </div>
          <div className="mt-3 text-[10px] text-surface-400 font-mono">
            {baselinedReqs} of {totalReqs} requirements formally baselined.
          </div>
        </div>

        {/* 2. Verification Health */}
        <div
          onClick={() => onNavigate('verify')}
          className="glass-panel p-5 rounded-xl border-t-2 border-t-sys-verify hover:border-sys-verify/50 cursor-pointer transition-colors"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-widest">
              Verification Status
            </h3>
            <span className="text-sys-verify font-mono text-xs">[V&V]</span>
          </div>
          <div className="flex justify-between items-end mb-2">
            <div className="text-3xl font-mono text-white">{passedPercent}%</div>
            <div className="text-xs text-surface-400">Tests Passed</div>
          </div>
          <div className="w-full bg-surface-900 h-1.5 rounded-full overflow-hidden flex">
            <div
              className="bg-sys-verify h-full transition-all duration-300"
              style={{ width: `${passedPercent}%` }}
            ></div>
            <div
              className="bg-red-500 h-full transition-all duration-300"
              style={{ width: `${failedPercent}%` }}
            ></div>
          </div>
          <div className="mt-3 text-[10px] font-mono flex items-center gap-1">
            {failedTests > 0 ? (
              <span className="text-red-400 font-bold">
                ! {failedTests} critical execution failure(s) recorded.
              </span>
            ) : (
              <span className="text-emerald-400">All executed procedures passing.</span>
            )}
          </div>
        </div>

        {/* 3. Safety & Quality */}
        <div
          onClick={() => onNavigate('quality')}
          className="glass-panel p-5 rounded-xl border-t-2 border-t-sys-risk hover:border-sys-risk/50 cursor-pointer transition-colors"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-widest">
              Safety & Quality
            </h3>
            <span className="text-sys-risk font-mono text-xs">[RSK]</span>
          </div>
          <div className="flex justify-between items-end mb-4">
            <div>
              <div className="text-2xl font-mono text-white leading-none">{highRisks}</div>
              <div className="text-[10px] text-surface-400 uppercase tracking-widest mt-1">
                High Risks
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-mono text-white leading-none">{openNCs}</div>
              <div className="text-[10px] text-surface-400 uppercase tracking-widest mt-1">
                Open NCs
              </div>
            </div>
          </div>
          <div className="text-[10px] font-mono">
            {highRisks > 0 || openNCs > 0 ? (
              <span className="text-red-400">Requires active mitigation and NC closure.</span>
            ) : (
              <span className="text-surface-400">Risks within acceptable thresholds.</span>
            )}
          </div>
        </div>

        {/* 4. Stage Gate & Release Readiness */}
        <div
          onClick={() => onNavigate('release')}
          className={`glass-panel p-5 rounded-xl border-t-2 cursor-pointer transition-colors ${
            isReleaseReady
              ? 'border-t-sys-release hover:border-sys-release/60'
              : 'border-t-red-500 hover:border-red-500/60'
          }`}
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-bold text-surface-400 uppercase tracking-widest">
              Gate Readiness
            </h3>
            <span className="text-sys-release font-mono text-xs">[REL]</span>
          </div>
          <div className="flex items-center gap-4 mb-3">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-base font-mono ${
                isReleaseReady
                  ? 'bg-sys-release/20 text-sys-release border border-sys-release/40'
                  : 'bg-red-500/20 text-red-500 border border-red-500/40'
              }`}
            >
              {isReleaseReady ? 'OK' : 'FAIL'}
            </div>
            <div>
              <div className="text-sm font-bold text-white font-mono">
                {isReleaseReady ? 'READY FOR REVIEW' : 'GATE BLOCKED'}
              </div>
              <div className="text-[10px] text-surface-400 font-mono">
                {isReleaseReady ? 'All criteria satisfied.' : 'Active mandatory blockers.'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stage Gate Criteria Breakdown Panel */}
      <div className="glass-panel p-6 rounded-xl border border-white/10 mb-8">
        <div className="flex justify-between items-center mb-4 border-b border-surface-800 pb-3">
          <div>
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
              Authoritative Lifecycle Gate Evaluation Ledger
            </h3>
            <p className="text-[10px] font-mono text-surface-400 mt-0.5">
              Deterministic verification evaluated against physical database state
            </p>
          </div>
          <span className="text-xs font-mono text-surface-400">
            {criteria.filter((c: any) => c.status === 'Met').length} / {criteria.length} PASSED
          </span>
        </div>

        <div className="space-y-2">
          {criteria.map((c: any) => (
            <div
              key={c.id}
              className={`p-3.5 border flex flex-col md:flex-row md:items-center justify-between gap-2 ${
                c.status === 'Met'
                  ? 'bg-emerald-500/5 border-emerald-500/20'
                  : 'bg-red-500/5 border-red-500/30'
              }`}
            >
              <div className="flex items-start md:items-center gap-3">
                <span
                  className={`px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase border ${
                    c.status === 'Met'
                      ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                      : 'text-red-400 border-red-500/40 bg-red-500/10'
                  }`}
                >
                  {c.status}
                </span>
                <div>
                  <div className="text-xs font-mono font-bold text-white">{c.name}</div>
                  <div className="text-xs text-surface-300 mt-0.5">{c.details}</div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[9px] font-mono uppercase text-surface-500">
                  {c.isMandatory ? 'MANDATORY BLOCKER' : 'ADVISORY CHECK'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
