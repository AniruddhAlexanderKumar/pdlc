import React from 'react';

interface SectionHeaderProps {
  title: string;
  subtitle: string;
  icon: string;
  color?: string;
  actions?: React.ReactNode;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  subtitle,
  icon,
  color = 'text-white',
  actions,
}) => (
  <div className="mb-6 border-b border-surface-800 pb-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div className="flex flex-col gap-1">
      <h2 className="text-lg font-mono font-bold text-white flex items-center gap-3 tracking-wide">
        <span className={color}>{icon}</span> {title.toUpperCase()}
      </h2>
      <p className="text-[10px] font-mono text-surface-400 uppercase tracking-widest">{subtitle}</p>
    </div>
    {actions && <div className="flex items-center gap-3">{actions}</div>}
  </div>
);
