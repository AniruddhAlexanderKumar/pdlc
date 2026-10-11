import React, { useState } from 'react';

interface PublicHeaderProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onOpenSignIn: () => void;
  onOpenSignUp: () => void;
}

export const PublicHeader: React.FC<PublicHeaderProps> = ({
  currentPath,
  onNavigate,
  onOpenSignIn,
  onOpenSignUp,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { path: '/', label: 'Overview' },
    { path: '/product', label: 'Capabilities' },
    { path: '/how-it-works', label: 'Lifecycle (NASA SE)' },
    { path: '/solutions', label: 'Solutions' },
    { path: '/security', label: 'Security & Governance' },
    { path: '/contact', label: 'Inquiries' },
  ];

  return (
    <header className="sticky top-0 z-40 bg-black/90 backdrop-blur-md border-b border-surface-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div
          onClick={() => onNavigate('/')}
          className="flex items-center gap-3 cursor-pointer select-none"
        >
          <div className="w-8 h-8 bg-brand/15 border border-brand/40 flex items-center justify-center font-mono font-bold text-brand text-xs">
            NX
          </div>
          <div>
            <span className="font-mono font-bold text-white tracking-widest text-sm uppercase">
              NexGen OS
            </span>
            <span className="text-[9px] text-surface-400 font-mono tracking-widest uppercase block -mt-1">
              Engineering PLM
            </span>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => onNavigate(link.path)}
              className={`text-xs font-mono uppercase tracking-wider transition-colors ${
                currentPath === link.path
                  ? 'text-brand font-bold border-b border-brand pb-0.5'
                  : 'text-surface-400 hover:text-white'
              }`}
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={onOpenSignIn}
            className="px-3.5 py-1.5 text-xs font-mono font-bold uppercase tracking-wider text-surface-300 hover:text-white border border-surface-700 hover:border-surface-500 rounded transition-all"
          >
            Sign In
          </button>
          <button
            onClick={onOpenSignUp}
            className="px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-wider bg-brand text-black hover:bg-brand-hover rounded shadow-lg shadow-brand/20 transition-all"
          >
            Request Access
          </button>
        </div>

        {/* Mobile Hamburger */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-surface-400 hover:text-white font-mono text-sm"
          >
            {mobileMenuOpen ? '[X]' : '[MENU]'}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-surface-950 border-b border-surface-800 px-4 pt-2 pb-4 space-y-2 font-mono text-xs">
          {navLinks.map((link) => (
            <button
              key={link.path}
              onClick={() => {
                onNavigate(link.path);
                setMobileMenuOpen(false);
              }}
              className="block w-full text-left py-2 text-surface-300 hover:text-brand"
            >
              {link.label}
            </button>
          ))}
          <div className="pt-2 border-t border-surface-800 flex gap-2">
            <button
              onClick={() => {
                onOpenSignIn();
                setMobileMenuOpen(false);
              }}
              className="flex-1 py-2 text-center text-white border border-surface-700"
            >
              Sign In
            </button>
            <button
              onClick={() => {
                onOpenSignUp();
                setMobileMenuOpen(false);
              }}
              className="flex-1 py-2 text-center bg-brand text-black font-bold"
            >
              Request Access
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
