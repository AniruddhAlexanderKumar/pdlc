import React from 'react';

interface PublicFooterProps {
  onNavigate: (path: string) => void;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({ onNavigate }) => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-surface-950 border-t border-surface-800 text-surface-400 font-mono text-xs py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 bg-brand/20 border border-brand/50 flex items-center justify-center font-bold text-brand text-xs">
              NX
            </div>
            <span className="font-bold text-white tracking-widest uppercase">NexGen PLM</span>
          </div>
          <p className="text-[11px] text-surface-500 leading-relaxed">
            The Systems Engineering Operating System connecting requirements, architecture, verification, and change control under strict configuration integrity.
          </p>
        </div>

        <div>
          <h4 className="text-white uppercase font-bold text-[11px] tracking-wider mb-3">Product</h4>
          <ul className="space-y-2 text-[11px]">
            <li><button onClick={() => onNavigate('/product')} className="hover:text-brand">Capabilities Matrix</button></li>
            <li><button onClick={() => onNavigate('/how-it-works')} className="hover:text-brand">15-Stage SE Lifecycle</button></li>
            <li><button onClick={() => onNavigate('/solutions')} className="hover:text-brand">Flight Actuators & Aerospace</button></li>
            <li><button onClick={() => onNavigate('/status')} className="hover:text-brand">System Status</button></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white uppercase font-bold text-[11px] tracking-wider mb-3">Security & Trust</h4>
          <ul className="space-y-2 text-[11px]">
            <li><button onClick={() => onNavigate('/security')} className="hover:text-brand">Data Sovereignty</button></li>
            <li><button onClick={() => onNavigate('/security')} className="hover:text-brand">Air-Gapped Deployment</button></li>
            <li><button onClick={() => onNavigate('/privacy')} className="hover:text-brand">Privacy Policy</button></li>
            <li><button onClick={() => onNavigate('/terms')} className="hover:text-brand">Terms of Service</button></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white uppercase font-bold text-[11px] tracking-wider mb-3">Contact & Access</h4>
          <ul className="space-y-2 text-[11px]">
            <li><button onClick={() => onNavigate('/contact')} className="hover:text-brand">Request Flight Demo</button></li>
            <li><button onClick={() => onNavigate('/login')} className="hover:text-brand">Sign In</button></li>
            <li className="text-[10px] text-surface-500 mt-2">
              Operator-Controlled Infrastructure<br />PostgreSQL 17 Database Engine
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-8 border-t border-surface-900 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px]">
        <div>&copy; {currentYear} NexGen Aerospace Systems. All rights reserved.</div>
        <div className="flex gap-4">
          <button onClick={() => onNavigate('/privacy')} className="hover:text-white">Privacy</button>
          <span>&bull;</span>
          <button onClick={() => onNavigate('/terms')} className="hover:text-white">Terms</button>
          <span>&bull;</span>
          <button onClick={() => onNavigate('/security')} className="hover:text-white">Security</button>
        </div>
      </div>
    </footer>
  );
};
