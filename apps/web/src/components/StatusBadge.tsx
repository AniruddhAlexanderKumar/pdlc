import React from 'react';

interface StatusBadgeProps {
  status: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const colors: Record<string, string> = {
    'Draft': 'text-surface-400 border-surface-700',
    'In Review': 'text-amber-400 border-amber-500/40 shadow-[0_0_8px_rgba(251,191,36,0.15)]',
    'Approved': 'text-brand border-brand/40 shadow-[0_0_8px_rgba(0,229,255,0.15)]',
    'Baselined': 'text-purple-400 border-purple-500/40 shadow-[0_0_8px_rgba(168,85,247,0.15)]',
    'Passed': 'text-emerald-400 border-emerald-500/40 shadow-[0_0_8px_rgba(16,185,129,0.15)]',
    'Mitigated': 'text-emerald-400 border-emerald-500/40',
    'Failed': 'text-red-500 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]',
    'Open': 'text-red-500 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]',
    'High': 'text-red-500 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.15)]',
    'Critical': 'text-red-500 border-red-500/40 shadow-[0_0_8px_rgba(239,68,68,0.2)]',
    'Medium': 'text-amber-400 border-amber-500/40',
    'Low': 'text-blue-400 border-blue-500/40',
    'Pending': 'text-orange-400 border-orange-500/40',
    'Planned': 'text-surface-400 border-surface-700',
    'Investigation': 'text-orange-400 border-orange-500/40',
    'Closed': 'text-emerald-400 border-emerald-500/40',
    'Submitted': 'text-amber-400 border-amber-500/40',
    'In Progress': 'text-brand border-brand/40',
    'Released': 'text-pink-400 border-pink-500/40 shadow-[0_0_8px_rgba(236,72,153,0.15)]',
  };

  return (
    <span className={`px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider border bg-black/50 ${colors[status] || colors.Draft}`}>
      {status}
    </span>
  );
};
