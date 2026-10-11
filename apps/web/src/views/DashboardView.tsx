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

  // The 6 Plain Engineering Questions (from Engineering OS Framework Section 1 & 18.1)
  const plainQuestions = [
    {
      q: '1. What are we developing and why?',
      detail: 'Mass Reduction & Bandwidth Optimization Program (OPP-001)',
      status: 'APPROVED',
      statusColor: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
      actionTab: 'reqs',
    },
    {
      q: '2. What must the product do, and how well?',
      detail: `${allocatedReqs} of ${totalReqs} requirements fully allocated to PBS components`,
      status: allocatedPercent === 100 ? 'ALLOCATED' : 'INCOMPLETE ALLOCATION',
      statusColor: allocatedPercent === 100 ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : 'text-amber-400 border-amber-500/40 bg-amber-500/10',
      actionTab: 'reqs',
    },
    {
      q: '3. How is the product structured?',
      detail: 'Product Breakdown Structure (SYS-001 to SYS-004) & Interface Control',
      status: 'STRUCTURED',
      statusColor: 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
      actionTab: 'arch',
    },
    {
      q: '4. How do we know it works and satisfies criteria?',
      detail: `${passedTests} passed, ${failedTests} failed execution(s) recorded in authoritative ledger`,
      status: failedTests > 0 ? 'FAILURES DETECTED' : 'VERIFIED',
      statusColor: failedTests > 0 ? 'text-red-400 border-red-500/40 bg-red-500/10' : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10',
      actionTab: 'verify',
    },
    {
      q: '5. How are changes controlled across the lifecycle?',
      detail: 'CCB active with automated ripple-effect impact traversal & ECO records',
      status: 'CONTROLLED',
      statusColor: 'text-sys-change border-sys-change/40 bg-sys-change/10',
      actionTab: 'change',
    },
    {
      q: '6. Are we ready to build, certify, or release?',
      detail: isReleaseReady ? 'All mandatory blockers cleared' : `Blocked by ${criteria.filter((c: any) => c.status !== 'Met' && c.isMandatory).length} mandatory criteria`,
      status: isReleaseReady ? 'RELEASE READY' : 'GATE BLOCKED',
      statusColor: isReleaseReady ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : 'text-red-400 border-red-500/40 bg-red-500/10',
      actionTab: 'release',
    },
  ];

  // The 15 PDLC Lifecycle Stages (Stages 01–15 from the Aerospace Systems Engineering Standard)
  const pdlcStages = [
    { num: '01', name: 'Opportunity & Problem', phase: 'Concept', active: false, done: true },
    { num: '02', name: 'Feasibility & Concept', phase: 'Concept', active: false, done: true },
    { num: '03', name: 'Stakeholder Needs', phase: 'Requirements', active: false, done: true },
    { num: '04', name: 'System Requirements', phase: 'Requirements', active: false, done: true },
    { num: '05', name: 'System Architecture', phase: 'Architecture', active: false, done: true },
    { num: '06', name: 'Detailed Design', phase: 'Design', active: true, done: false },
    { num: '07', name: 'Design Review (PDR/CDR)', phase: 'Review', active: false, done: false },
    { num: '08', name: 'Implementation & Build', phase: 'Realization', active: false, done: false },
    { num: '09', name: 'Integration & Testing', phase: 'V&V', active: false, done: false },
    { num: '10', name: 'Verification (Compliance)', phase: 'V&V', active: false, done: false },
    { num: '11', name: 'System Validation', phase: 'V&V', active: false, done: false },
    { num: '12', name: 'Certification / Safety', phase: 'Assurance', active: false, done: false },
    { num: '13', name: 'Release to Production', phase: 'Release', active: false, done: false },
    { num: '14', name: 'Operations & In-Service', phase: 'Operations', active: false, done: false },
    { num: '15', name: 'Change & Retirement', phase: 'Sustaining', active: false, done: false },
  ];

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

      {/* 15-Stage PDLC Lifecycle Pipeline Banner */}
      <div className="glass-panel p-4 rounded-xl border border-white/10 mb-6 overflow-x-auto">
        <div className="flex justify-between items-center mb-3">
          <div className="text-xs font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
            NASA SE / ISO 15288 / ARP4754B Product Development Lifecycle (Stages 01–15)
          </div>
          <span className="text-[10px] font-mono text-brand border border-brand/30 px-2 py-0.5">
            CURRENT: STAGE 06 // DETAILED DESIGN
          </span>
        </div>
        <div className="flex items-center gap-1 min-w-[900px]">
          {pdlcStages.map((s) => (
            <div
              key={s.num}
              className={`flex-1 p-2 rounded border text-center transition-all ${
                s.active
                  ? 'bg-brand/15 border-brand text-white shadow-lg shadow-brand/10'
                  : s.done
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-surface-900/50 border-surface-800 text-surface-500'
              }`}
            >
              <div className="text-[9px] font-mono font-bold">{s.num}</div>
              <div className="text-[10px] font-medium truncate mt-0.5" title={s.name}>
                {s.name}
              </div>
              <div className="text-[8px] font-mono uppercase tracking-widest opacity-60 mt-0.5">
                {s.done ? 'COMPLETED' : s.active ? 'IN PROGRESS' : 'UPCOMING'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* What Should I Do Next? Guided Action Card */}
      <div className="glass-panel p-5 rounded-xl border border-brand/40 bg-brand/5 mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded bg-brand/20 border border-brand/50 flex items-center justify-center font-mono font-bold text-brand shrink-0 text-sm">
            &rarr;
          </div>
          <div>
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-brand mb-0.5">
              Recommended Next Engineering Step
            </div>
            <div className="text-sm font-mono font-bold text-white">
              {failedTests > 0
                ? 'Investigate Dynamic Test VRF-002 & Close Blocking Nonconformance NC-001'
                : 'Freeze Configuration Baseline & Review Allocation Completeness'}
            </div>
            <p className="text-xs text-surface-300 mt-1 max-w-2xl">
              {failedTests > 0
                ? 'A critical 5kN dynamic stroke test failed (transit time exceeded allowable 0.8s limit). Engineering release is blocked until root cause is addressed and NC-001 is closed.'
                : 'All executed procedures are currently passing. You can now establish an immutable baseline snapshot for stage review.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {failedTests > 0 ? (
            <>
              <button
                onClick={() => onNavigate('quality')}
                className="px-3.5 py-2 bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono text-xs font-bold hover:bg-amber-500/30 transition-colors rounded"
              >
                Resolve NC-001 &rarr;
              </button>
              <button
                onClick={() => onNavigate('verify')}
                className="px-3.5 py-2 bg-sys-verify text-white font-mono text-xs font-bold hover:bg-emerald-600 transition-colors rounded shadow-lg shadow-sys-verify/20"
              >
                Re-Run VRF-002 &rarr;
              </button>
            </>
          ) : (
            <button
              onClick={() => onNavigate('baselines')}
              className="px-4 py-2 bg-purple-600 text-white font-mono text-xs font-bold hover:bg-purple-500 transition-colors rounded"
            >
              Freeze Baseline &rarr;
            </button>
          )}
        </div>
      </div>

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

      {/* The 6 Plain Engineering Questions Framework (Section 1 & 18.1) */}
      <div className="glass-panel p-6 rounded-xl border border-white/10 mb-8">
        <div className="flex justify-between items-center mb-4 border-b border-surface-800 pb-3">
          <div>
            <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span className="text-brand">[?]</span> The 6 Plain Engineering Questions
            </h3>
            <p className="text-[10px] font-mono text-surface-400 mt-0.5">
              NASA Systems Engineering Handbook & ISO 15288 Core Decision Assurance
            </p>
          </div>
          <span className="text-xs font-mono text-brand border border-brand/30 px-2 py-0.5">
            HONEST PRODUCT MATURITY AUDIT
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plainQuestions.map((pq, idx) => (
            <div
              key={idx}
              onClick={() => onNavigate(pq.actionTab)}
              className="bg-surface-900/70 border border-surface-800 p-4 rounded-lg flex flex-col justify-between hover:border-brand/40 cursor-pointer transition-colors"
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono font-bold text-white leading-tight">
                    {pq.q}
                  </span>
                </div>
                <p className="text-[11px] text-surface-300 mb-3">
                  {pq.detail}
                </p>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-surface-800/80 mt-auto">
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 border ${pq.statusColor}`}>
                  {pq.status}
                </span>
                <span className="text-[10px] font-mono text-surface-400 hover:text-white flex items-center gap-1">
                  EXPLORE &rarr;
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

