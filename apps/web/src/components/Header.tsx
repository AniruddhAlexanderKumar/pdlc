import React from 'react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenSearch: () => void;
  onResetDemo: () => void;
  user: any;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSearch,
  onResetDemo,
  user,
}) => {
  const tabs = [
    { id: 'dashboard', label: 'Telemetry', color: 'text-white', border: 'border-t-brand' },
    { id: 'reqs', label: 'Requirements', color: 'text-sys-req', border: 'border-t-sys-req' },
    { id: 'arch', label: 'Architecture', color: 'text-sys-arch', border: 'border-t-sys-arch' },
    { id: 'verify', label: 'Verification', color: 'text-sys-verify', border: 'border-t-sys-verify' },
    { id: 'change', label: 'Change Control', color: 'text-sys-change', border: 'border-t-sys-change' },
    { id: 'risk', label: 'Risk & Safety', color: 'text-sys-risk', border: 'border-t-sys-risk' },
    { id: 'quality', label: 'Quality & NC', color: 'text-amber-400', border: 'border-t-amber-400' },
    { id: 'baselines', label: 'Baselines', color: 'text-purple-400', border: 'border-t-purple-400' },
    { id: 'release', label: 'Release Gate', color: 'text-sys-release', border: 'border-t-sys-release' },
    { id: 'documents', label: 'Documents', color: 'text-brand', border: 'border-t-brand' },
    { id: 'tasks', label: 'Tasks', color: 'text-white', border: 'border-t-brand' },
    { id: 'audit', label: 'Audit Log', color: 'text-surface-400', border: 'border-t-surface-400' },
    { id: 'commercial', label: 'Org & Plans', color: 'text-emerald-400', border: 'border-t-emerald-400' },
  ];

  return (
    <header className="bg-[#0a0a0a] border-b border-surface-800 flex items-end px-4 pt-3 z-20 shrink-0 select-none">
      {/* Branding */}
      <div className="flex items-center gap-3 mr-6 mb-2 shrink-0 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
        <div className="w-7 h-7 bg-brand/10 flex items-center justify-center text-brand border border-brand/30 font-mono font-bold text-xs">
          NX
        </div>
        <div>
          <h1 className="font-mono font-bold text-white text-xs leading-none tracking-widest uppercase">
            NexGen OS
          </h1>
          <p className="text-[8px] text-surface-500 font-mono tracking-widest uppercase mt-1">
            Systems Eng.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map((tab, idx) => {
          const isActive = activeTab === tab.id;
          const num = String(idx + 1).padStart(2, '0');
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2.5 text-[11px] font-mono font-bold uppercase tracking-wider transition-all duration-150 border-t-2 border-x border-x-transparent shrink-0 ${
                isActive
                  ? `bg-black text-white ${tab.border} border-x-surface-800`
                  : 'bg-transparent text-surface-500 border-t-transparent hover:bg-surface-900 hover:text-surface-300'
              }`}
            >
              <span className={`text-[9px] opacity-60 ${isActive ? tab.color : ''}`}>
                {num}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* User, Search & Quick Actions */}
      <div className="flex items-center gap-3 mb-2 ml-4 shrink-0">
        <button
          onClick={onOpenSearch}
          className="px-2.5 py-1 bg-surface-900 border border-surface-700 text-surface-300 hover:text-white text-[10px] font-mono uppercase tracking-wider flex items-center gap-1.5"
          title="Search all artifacts"
        >
          <span>SEARCH</span>
          <span className="text-surface-500 text-[9px]">[CTRL+K]</span>
        </button>

        <button
          onClick={onResetDemo}
          className="px-2.5 py-1 border border-red-500/30 text-red-400 hover:bg-red-500/10 text-[9px] font-mono uppercase tracking-widest transition-colors rounded"
          title="Reset PostgreSQL state to initial actuator scenario"
        >
          Reset Demo
        </button>

        <div className="flex items-center gap-2 pl-3 border-l border-surface-800">
          <div className="text-right">
            <div className="text-[10px] font-mono font-bold text-white truncate max-w-[120px]">
              {user?.name || 'Dr. Elena Rostova'}
            </div>
            <div className="text-[8px] font-mono text-brand flex items-center gap-1 justify-end">
              <span className="w-1.5 h-1.5 bg-brand animate-pulse"></span>
              {user?.role || 'SystemsEngineer'}
            </div>
          </div>
          <div className="w-7 h-7 bg-surface-800 text-surface-300 flex items-center justify-center border border-surface-700 font-mono text-xs font-bold">
            SE
          </div>
        </div>
      </div>
    </header>
  );
};
