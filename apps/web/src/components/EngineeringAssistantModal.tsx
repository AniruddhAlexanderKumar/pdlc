import React, { useState } from 'react';

interface EngineeringAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  telemetry: any;
  onNavigate: (tab: string) => void;
}

export const EngineeringAssistantModal: React.FC<EngineeringAssistantModalProps> = ({
  isOpen,
  onClose,
  telemetry,
  onNavigate,
}) => {
  const [selectedTopic, setSelectedTopic] = useState<string>('what_next');
  const [userQuery, setUserQuery] = useState('');
  const [customReply, setCustomReply] = useState<string | null>(null);

  if (!isOpen) return null;

  const failedTests = telemetry?.failedTests || 0;
  const highRisks = telemetry?.highRisks || 0;
  const openNCs = telemetry?.openNCs || 0;
  const totalReqs = telemetry?.totalReqs || 0;
  const allocatedReqs = telemetry?.allocatedReqs || 0;

  const handleAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userQuery.trim()) return;
    const lower = userQuery.toLowerCase();

    if (lower.includes('next') || lower.includes('do now')) {
      setSelectedTopic('what_next');
    } else if (lower.includes('block') || lower.includes('gate') || lower.includes('why')) {
      setSelectedTopic('blockers');
    } else if (lower.includes('requirement') || lower.includes('req')) {
      setSelectedTopic('requirements');
    } else if (lower.includes('test') || lower.includes('verification')) {
      setSelectedTopic('testing');
    } else if (lower.includes('change') || lower.includes('ecr')) {
      setSelectedTopic('changes');
    } else {
      setCustomReply(
        `Based on authoritative project state for ${telemetry?.project?.name}: You have ${totalReqs} requirements (${allocatedReqs} allocated), ${failedTests} failed test(s), and ${openNCs} open nonconformances. Use the navigation buttons below to review the specific engineering evidence.`
      );
      setSelectedTopic('custom');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-2xl bg-surface-900 border border-brand/50 rounded-xl p-6 flex flex-col shadow-2xl max-h-[85vh]">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-surface-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand animate-pulse"></span>
            <div>
              <h3 className="text-sm font-mono font-bold text-white uppercase tracking-wider">
                Engineering Guidance Assistant // Decision Copilot
              </h3>
              <p className="text-[10px] font-mono text-surface-400">
                Plain-language explanations grounded strictly in authoritative PostgreSQL records
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-white font-mono text-xs px-2 py-1"
          >
            [CLOSE]
          </button>
        </div>

        {/* Quick Question Buttons */}
        <div className="flex flex-wrap gap-1.5 mb-4 pb-3 border-b border-surface-800">
          <button
            onClick={() => { setSelectedTopic('what_next'); setCustomReply(null); }}
            className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
              selectedTopic === 'what_next'
                ? 'bg-brand/20 text-brand border-brand/40'
                : 'bg-surface-950 text-surface-400 border-surface-800 hover:text-white'
            }`}
          >
            What should I do next?
          </button>
          <button
            onClick={() => { setSelectedTopic('blockers'); setCustomReply(null); }}
            className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
              selectedTopic === 'blockers'
                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                : 'bg-surface-950 text-surface-400 border-surface-800 hover:text-white'
            }`}
          >
            Why is the stage gate blocked?
          </button>
          <button
            onClick={() => { setSelectedTopic('requirements'); setCustomReply(null); }}
            className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
              selectedTopic === 'requirements'
                ? 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                : 'bg-surface-950 text-surface-400 border-surface-800 hover:text-white'
            }`}
          >
            What is a requirement allocation?
          </button>
          <button
            onClick={() => { setSelectedTopic('testing'); setCustomReply(null); }}
            className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
              selectedTopic === 'testing'
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-surface-950 text-surface-400 border-surface-800 hover:text-white'
            }`}
          >
            How do verification tests work?
          </button>
          <button
            onClick={() => { setSelectedTopic('changes'); setCustomReply(null); }}
            className={`px-2.5 py-1 text-xs font-mono rounded border transition-colors ${
              selectedTopic === 'changes'
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                : 'bg-surface-950 text-surface-400 border-surface-800 hover:text-white'
            }`}
          >
            How does change control work?
          </button>
        </div>

        {/* Dynamic Context Answer */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
          {selectedTopic === 'what_next' && (
            <div className="p-4 bg-surface-950 border border-surface-800 rounded-lg space-y-3">
              <div className="font-mono font-bold text-brand text-sm">
                Recommended Next Engineering Action
              </div>
              {failedTests > 0 ? (
                <>
                  <p className="text-surface-300 leading-relaxed">
                    Your highest priority is to <strong className="text-red-400">investigate and resolve the failed dynamic test (VRF-002)</strong>.
                    Because this test failed, a nonconformance report (<strong className="text-amber-400">NC-001</strong>) was automatically raised and is currently blocking stage release.
                  </p>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => { onNavigate('quality'); onClose(); }}
                      className="px-3 py-1.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 font-mono font-bold hover:bg-amber-500/30"
                    >
                      Resolve NC-001 &rarr;
                    </button>
                    <button
                      onClick={() => { onNavigate('verify'); onClose(); }}
                      className="px-3 py-1.5 bg-sys-verify/20 text-sys-verify border border-sys-verify/40 font-mono font-bold hover:bg-sys-verify/30"
                    >
                      Re-run VRF-002 &rarr;
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-surface-300 leading-relaxed">
                    All executed tests are passing! Your next logical action is to freeze the current configuration baseline or review remaining planned verification procedures.
                  </p>
                  <button
                    onClick={() => { onNavigate('baselines'); onClose(); }}
                    className="px-3 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/40 font-mono font-bold hover:bg-purple-500/30"
                  >
                    Open Baselines Ledger &rarr;
                  </button>
                </>
              )}
            </div>
          )}

          {selectedTopic === 'blockers' && (
            <div className="p-4 bg-surface-950 border border-red-500/30 rounded-lg space-y-3">
              <div className="font-mono font-bold text-red-400 text-sm">
                Why Stage Gate Approval is Currently Blocked
              </div>
              <p className="text-surface-300 leading-relaxed">
                In regulated systems engineering (NASA SE / FAA / EASA), an engineering phase cannot be approved while critical safety risks or failed verification tests remain open.
              </p>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center gap-2 text-red-300">
                  <span>&bull;</span>
                  <span>{failedTests} critical execution failure recorded (VRF-002 transit time exceeded limit)</span>
                </div>
                <div className="flex items-center gap-2 text-amber-300">
                  <span>&bull;</span>
                  <span>{openNCs} open nonconformance under root-cause investigation (NC-001)</span>
                </div>
                <div className="flex items-center gap-2 text-amber-300">
                  <span>&bull;</span>
                  <span>{highRisks} unmitigated high-risk item (RSK-001 Motor Thermal Overload)</span>
                </div>
              </div>
              <div className="pt-2">
                <button
                  onClick={() => { onNavigate('release'); onClose(); }}
                  className="px-3 py-1.5 bg-sys-release text-white font-mono font-bold hover:bg-pink-600"
                >
                  Inspect Authoritative Gate Ledger &rarr;
                </button>
              </div>
            </div>
          )}

          {selectedTopic === 'requirements' && (
            <div className="p-4 bg-surface-950 border border-surface-800 rounded-lg space-y-3">
              <div className="font-mono font-bold text-purple-400 text-sm">
                Understanding Requirements & Allocation
              </div>
              <p className="text-surface-300 leading-relaxed">
                A <strong>requirement</strong> is a measurable statement of what the product must do (e.g. "Total actuator mass shall not exceed 2.2 kg").
              </p>
              <p className="text-surface-300 leading-relaxed">
                <strong>Allocation</strong> means connecting that requirement to the specific physical component in your Product Breakdown Structure (PBS) responsible for satisfying it (e.g., allocating a thermal requirement to the Motor Controller PCBA).
              </p>
              <button
                onClick={() => { onNavigate('reqs'); onClose(); }}
                className="px-3 py-1.5 bg-sys-req/20 text-sys-req border border-sys-req/40 font-mono font-bold hover:bg-sys-req/30"
              >
                Go to Requirements Engineering &rarr;
              </button>
            </div>
          )}

          {selectedTopic === 'testing' && (
            <div className="p-4 bg-surface-950 border border-surface-800 rounded-lg space-y-3">
              <div className="font-mono font-bold text-emerald-400 text-sm">
                Verification & Empirical Testing
              </div>
              <p className="text-surface-300 leading-relaxed">
                Verification proves that your design satisfies its requirements. You can verify through:
                <strong> Test</strong> (physical instrumented measurement), <strong>Analysis</strong> (calculations/simulations), <strong>Inspection</strong> (visual/dimensional audit), or <strong>Demonstration</strong>.
              </p>
              <p className="text-surface-300 leading-relaxed">
                In this OS, clicking "Record Test Execution" requires you to enter actual physical measurements (e.g. transit time in seconds, current draw in Amperes).
              </p>
              <button
                onClick={() => { onNavigate('verify'); onClose(); }}
                className="px-3 py-1.5 bg-sys-verify/20 text-sys-verify border border-sys-verify/40 font-mono font-bold hover:bg-sys-verify/30"
              >
                Go to Verification & Validation Ledger &rarr;
              </button>
            </div>
          )}

          {selectedTopic === 'changes' && (
            <div className="p-4 bg-surface-950 border border-surface-800 rounded-lg space-y-3">
              <div className="font-mono font-bold text-amber-400 text-sm">
                Engineering Change Control Board (CCB)
              </div>
              <p className="text-surface-300 leading-relaxed">
                When you need to modify a requirement or component, you create an <strong>Engineering Change Request (ECR)</strong>.
              </p>
              <p className="text-surface-300 leading-relaxed">
                The NexGen graph engine automatically performs a <strong>ripple-effect impact analysis</strong>, tracing which tests are invalidated and require retesting, and which risks are reopened, before the CCB approves it.
              </p>
              <button
                onClick={() => { onNavigate('change'); onClose(); }}
                className="px-3 py-1.5 bg-sys-change/20 text-sys-change border border-sys-change/40 font-mono font-bold hover:bg-sys-change/30"
              >
                Open CCB Impact Canvas &rarr;
              </button>
            </div>
          )}

          {selectedTopic === 'custom' && customReply && (
            <div className="p-4 bg-surface-950 border border-brand/40 rounded-lg space-y-2">
              <div className="font-mono font-bold text-brand text-xs">Answer:</div>
              <p className="text-surface-300 leading-relaxed">{customReply}</p>
            </div>
          )}
        </div>

        {/* Freeform Prompt Bar */}
        <form onSubmit={handleAsk} className="mt-4 pt-3 border-t border-surface-800 flex gap-2">
          <input
            type="text"
            placeholder="Ask anything (e.g. 'Why is the test failing?', 'How do I add a requirement?')..."
            value={userQuery}
            onChange={(e) => setUserQuery(e.target.value)}
            className="flex-1 bg-surface-950 border border-surface-700 text-xs text-white p-2.5 font-mono rounded focus:outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-brand text-black hover:bg-brand-hover text-xs font-mono font-bold uppercase rounded transition-colors"
          >
            ASK
          </button>
        </form>
      </div>
    </div>
  );
};
