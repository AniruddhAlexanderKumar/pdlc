import React, { useState } from 'react';
import { api, setAuthToken } from '../../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register' | 'forgot' | 'reset';
  onClose: () => void;
  onSuccess: (user: any) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(initialMode);
  
  // Login / Register Form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Forgot / Reset Form
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Status & Feedback
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (mode === 'login') {
        const res = await api.login({ email, password });
        setAuthToken(res.token);
        onSuccess(res.user);
        onClose();
      } else if (mode === 'register') {
        const res = await api.register({
          name,
          email,
          password,
          organizationName: orgName || undefined,
        });
        setAuthToken(res.token);
        onSuccess(res.user);
        onClose();
      } else if (mode === 'forgot') {
        const res = await api.forgotPassword(email);
        setSuccessMsg(res.message);
        if (res.devToken) {
          setResetToken(res.devToken);
          setMode('reset');
        }
      } else if (mode === 'reset') {
        const res = await api.resetPassword({
          token: resetToken,
          newPassword,
        });
        setSuccessMsg(res.message);
        setMode('login');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Operation failed. Please verify submitted credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 font-mono">
      <div className="glass-panel w-full max-w-md bg-surface-900 border border-brand/40 rounded-xl p-6 flex flex-col shadow-2xl">
        <div className="flex justify-between items-center border-b border-surface-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-brand/20 border border-brand/40 flex items-center justify-center font-bold text-brand text-[10px]">
              NX
            </div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">
              {mode === 'login' && 'Sign In to Engineering Console'}
              {mode === 'register' && 'Create Engineering Account'}
              {mode === 'forgot' && 'Reset Account Password'}
              {mode === 'reset' && 'Set New Account Password'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-white text-xs px-2 py-1"
          >
            [ESC]
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 text-red-400 text-xs rounded">
            ! {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="p-3 mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs rounded">
            &check; {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="text-[10px] text-surface-400 uppercase tracking-widest block mb-1">
                  Full Name
                </label>
                <input
                  required
                  type="text"
                  placeholder="e.g. Dr. Jordan Vance"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand"
                />
              </div>

              <div>
                <label className="text-[10px] text-surface-400 uppercase tracking-widest block mb-1">
                  Organization / Program Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Orbital Propulsion Systems"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand"
                />
              </div>
            </>
          )}

          {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
            <div>
              <label className="text-[10px] text-surface-400 uppercase tracking-widest block mb-1">
                Work Email Address
              </label>
              <input
                required
                type="email"
                placeholder="engineer@nexgen.os"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand"
              />
            </div>
          )}

          {(mode === 'login' || mode === 'register') && (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[10px] text-surface-400 uppercase tracking-widest">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setMode('forgot'); setErrorMsg(null); }}
                    className="text-[10px] text-brand hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  required
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 pr-12 focus:outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-[10px] text-surface-400 hover:text-white"
                >
                  {showPassword ? 'HIDE' : 'SHOW'}
                </button>
              </div>
            </div>
          )}

          {mode === 'reset' && (
            <>
              <div>
                <label className="text-[10px] text-surface-400 uppercase tracking-widest block mb-1">
                  Reset Verification Token
                </label>
                <input
                  required
                  type="text"
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] text-surface-400 uppercase tracking-widest block mb-1">
                  New Password (min 6 characters)
                </label>
                <input
                  required
                  type="password"
                  placeholder="••••••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-surface-950 border border-surface-700 text-xs text-white p-2.5 focus:outline-none focus:border-brand"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-brand text-black hover:bg-brand-hover font-bold text-xs uppercase tracking-wider rounded transition-colors disabled:opacity-40"
          >
            {submitting ? 'AUTHENTICATING...' : (
              mode === 'login' ? 'SIGN IN' :
              mode === 'register' ? 'REGISTER & ENTER' :
              mode === 'forgot' ? 'SEND RESET INSTRUCTIONS' :
              'SUBMIT NEW PASSWORD'
            )}
          </button>
        </form>

        {/* Footer switches */}
        <div className="mt-4 pt-3 border-t border-surface-800 text-[11px] text-center text-surface-400">
          {mode === 'login' && (
            <div>
              New to NexGen PLM?{' '}
              <button
                type="button"
                onClick={() => { setMode('register'); setErrorMsg(null); }}
                className="text-brand hover:underline"
              >
                Create Account
              </button>
            </div>
          )}
          {mode === 'register' && (
            <div>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setErrorMsg(null); }}
                className="text-brand hover:underline"
              >
                Sign In
              </button>
            </div>
          )}
          {(mode === 'forgot' || mode === 'reset') && (
            <div>
              Return to{' '}
              <button
                type="button"
                onClick={() => { setMode('login'); setErrorMsg(null); }}
                className="text-brand hover:underline"
              >
                Sign In
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
