import React, { useState } from 'react';

interface PublicHeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
  onEnterWorkspace?: () => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  currentPath,
  onNavigate,
  onOpenSignIn,
  onOpenSignUp,
  onEnterWorkspace,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { path: '/', label: 'Overview' },
    { path: '/product', label: 'Capabilities' },
    { path: '/how-it-works', label: 'NASA 15-Stage SE' },
    { path: '/solutions', label: 'Solutions' },
    { path: '/security', label: 'Data Sovereignty' },
    { path: '/contact', label: 'Inquiries' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md border-b border-surface-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={() => onNavigate('/')}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <div className="w-8 h-8 bg-brand/15 border border-brand/50 flex items-center justify-center font-mono font-bold text-brand text-xs group-hover:bg-brand/25 transition-colors">
            NX
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-white tracking-widest text-sm uppercase">
                NexGen PLM
              </span>
              <span className="px-1.5 py-0.2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[8px] font-mono font-bold rounded">
                v2.4
              </span>
            </div>
            <span className="text-[9px] text-surface-400 font-mono tracking-widest uppercase block -mt-0.5">
              Engineering Operating System
            </span>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center gap-6">
          {navLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => onNavigate(link.path)}
              className={`text-xs font-mono uppercase tracking-wider transition-colors ${
                currentPath === link.path
                  ? 'text-brand font-bold border-b-2 border-brand pb-0.5'
                  : 'text-surface-400 hover:text-white'
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* CTAs */}
        <div className="hidden sm:flex items-center gap-2.5">
          <button
            onClick={() => {
              if (onOpenSignIn) onOpenSignIn();
              onNavigate('/signin');
            }}
            className={`px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider rounded transition-all ${
              currentPath === '/signin'
                ? 'bg-brand/15 text-brand border border-brand/60'
                : 'text-surface-300 hover:text-white border border-surface-700 hover:border-surface-500 bg-surface-900/60'
            }`}
          >
            Sign In
          </button>

          {onEnterWorkspace && (
            <button
              onClick={onEnterWorkspace}
              className="px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-brand text-black hover:bg-brand-hover rounded shadow-lg shadow-brand/20 transition-all flex items-center gap-1.5"
              title="Launch full 13-module engineering operating system preview"
            >
              <span className="w-1.5 h-1.5 bg-black rounded-full animate-ping"></span>
              <span>Launch Live Workspace →</span>
            </button>
          )}

          <button
            onClick={onOpenSignUp}
            className="px-3 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-surface-400 hover:text-white transition-colors"
          >
            Request Access
          </button>
        </div>

        {/* Mobile Hamburger */}
        <div className="lg:hidden flex items-center gap-2">
          {onEnterWorkspace && (
            <button
              onClick={onEnterWorkspace}
              className="px-2.5 py-1 text-[11px] font-mono font-bold uppercase tracking-wider bg-brand text-black rounded"
            >
              Live Demo →
            </button>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-surface-400 hover:text-white font-mono text-sm border border-surface-700 rounded"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-surface-950 border-b border-surface-800 px-4 pt-3 pb-5 space-y-2.5 font-mono text-xs">
          {navLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => {
                onNavigate(link.path);
                setMobileMenuOpen(false);
              }}
              className={`block w-full text-left py-2 px-2 rounded ${
                currentPath === link.path
                  ? 'bg-brand/10 text-brand font-bold'
                  : 'text-surface-300 hover:text-brand'
              }`}
            >
              {link.label}
            </button>
          ))}
          <div className="pt-3 border-t border-surface-800 flex flex-col gap-2">
            <button
              onClick={() => {
                onNavigate('/signin');
                setMobileMenuOpen(false);
              }}
              className="w-full py-2 text-center text-white border border-surface-700 rounded bg-surface-900"
            >
              Sign In to Organization
            </button>
            {onEnterWorkspace && (
              <button
                onClick={() => {
                  onEnterWorkspace();
                  setMobileMenuOpen(false);
                }}
                className="w-full py-2 text-center bg-brand text-black font-bold rounded shadow-lg shadow-brand/20"
              >
                Launch Live Workspace (Demo) →
              </button>
            )}
            <button
              onClick={() => {
                onOpenSignUp();
                setMobileMenuOpen(false);
              }}
              className="w-full py-1.5 text-center text-surface-400 hover:text-white text-[11px]"
            >
              Request Access / Organization Setup
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
