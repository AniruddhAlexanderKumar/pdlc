import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Gauge,
  Lightbulb,
  LineChart,
  Plus,
  Rocket,
  Sparkles,
  Wand2
} from 'lucide-react';
import { CURRENCIES, currencySymbol, type CurrencyCode, type Me, type Product, type WithXp } from '@sv/shared';
import { ApiError, get, post } from '../../api/client';
import { useMe, useResetSession } from '../../api/hooks';
import { Button, Field, Input, Select, Spinner } from '../../components/ui';

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm shadow-indigo-500/30">
        <Gauge className="h-4.5 w-4.5" />
      </div>
      <span className="font-semibold tracking-tight">Solution Velocity</span>
    </div>
  );
}

function Shell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex flex-col justify-center px-4 py-10 sm:px-12">
        <div className={`mx-auto w-full transition-all duration-200 ${wide ? 'max-w-lg' : 'max-w-sm'}`}>
          <Logo className="mb-8" />
          {children}
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-zinc-900 lg:flex lg:flex-col lg:justify-center lg:px-16 dark:bg-zinc-900/60">
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative max-w-md text-white">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight">Plan, track and improve your products, one level at a time.</h2>
          <div className="mt-10 space-y-6">
            {[
              { icon: Lightbulb, title: 'Tell us', body: 'Answer quick questions about your product and earn XP as the picture comes together.' },
              { icon: LineChart, title: 'Track it', body: 'See exactly where your money goes and how much you keep on every sale.' },
              { icon: Rocket, title: 'Improve it', body: 'Get smart suggestions, such as a cheaper supplier or a better price, and level up each product.' }
            ].map((s, i) => (
              <div key={s.title} className="flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
                  <s.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-indigo-300">Step {i + 1}</p>
                  <p className="font-medium">{s.title}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ErrorText({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
      {error instanceof Error ? error.message : 'Something went wrong'}
    </p>
  );
}

function useSignedIn() {
  const reset = useResetSession();
  return (me: Me) => reset(me);
}

function getPasswordStrength(pw: string) {
  const hasMinLength = pw.length >= 10;
  const hasLetter = /[a-zA-Z]/.test(pw);
  const hasOther = /[^a-zA-Z]/.test(pw);
  const hasBoth = hasLetter && hasOther;
  const isLong = pw.length >= 14;

  let score = 0;
  if (hasMinLength) score++;
  if (hasBoth) score++;
  if (isLong && /[0-9]/.test(pw) && /[^a-zA-Z0-9]/.test(pw)) score++;

  let label = '';
  if (pw.length > 0) {
    if (score <= 1) label = 'Weak';
    else if (score === 2) label = 'Good';
    else label = 'Strong';
  }

  return {
    hasMinLength,
    hasLetter,
    hasOther,
    hasBoth,
    isValid: hasMinLength && hasBoth,
    score,
    label
  };
}

function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const steps = [
    { number: 1, label: 'Account' },
    { number: 2, label: 'Workspace' },
    { number: 3, label: 'Get Started' }
  ];

  return (
    <div className="mb-8" aria-label="Sign up progress">
      <div className="flex items-center justify-between">
        {steps.map((s, idx) => {
          const isDone = currentStep > s.number;
          const isActive = currentStep === s.number;
          return (
            <div key={s.number} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isDone
                      ? 'bg-emerald-600 text-white'
                      : isActive
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-indigo-900/50'
                        : 'border border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500'
                  }`}
                >
                  {isDone ? <Check className="h-4 w-4 stroke-[3]" /> : s.number}
                </div>
                <span
                  className={`mt-1.5 text-[11px] font-medium tracking-tight ${
                    isActive
                      ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                      : isDone
                        ? 'text-zinc-700 dark:text-zinc-300'
                        : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 transition-colors ${
                    currentStep > s.number ? 'bg-emerald-500' : 'bg-zinc-200 dark:bg-zinc-800'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AuthFormProps {
  mode: 'login' | 'register';
  inviteToken?: string;
  step?: 1 | 2 | 3;
  onStepChange?: (step: 1 | 2 | 3) => void;
}

function AuthForm({ mode, inviteToken, step = 1, onStepChange }: AuthFormProps) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const signedIn = useSignedIn();

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    workspaceName: '',
    currency: 'USD' as CurrencyCode
  });

  const [productForm, setProductForm] = useState({
    name: '',
    category: '',
    targetPrice: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [registeredMe, setRegisteredMe] = useState<Me | null>(null);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setClientError(null);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };

  const cfg = useQuery({
    queryKey: ['auth-config'],
    queryFn: () => get<{ allowSignup: boolean }>('/auth/config'),
    enabled: mode === 'register' && !inviteToken
  });

  const loginMutation = useMutation({
    mutationFn: () => post<Me>('/auth/login', { email: form.email, password: form.password }),
    onSuccess: (me) => {
      signedIn(me);
      if (me.user.isAdmin) {
        navigate('/admin');
      } else {
        const next = params.get('next');
        navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
      }
    }
  });

  const registerMutation = useMutation({
    mutationFn: () =>
      post<Me>('/auth/register', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(inviteToken
          ? { inviteToken }
          : {
              workspaceName: form.workspaceName.trim() || undefined,
              currency: form.currency
            })
      })
  });

  const createProductMutation = useMutation({
    mutationFn: (data: { name: string; category?: string; targetSellingPrice?: number | null }) =>
      post<WithXp<Product>>('/products', data)
  });

  const loadSamplesMutation = useMutation({
    mutationFn: () => post('/workspace/sample-data', {})
  });

  const passwordStrength = getPasswordStrength(form.password);
  const suggestedWorkspaceName = form.name.trim() ? `${form.name.trim().split(' ')[0]}'s workspace` : 'Acme Products';

  const validateStep1 = () => {
    if (!form.name.trim()) {
      setClientError('Please enter your full name.');
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) {
      setClientError('Please enter a valid email address.');
      return false;
    }
    if (!passwordStrength.isValid) {
      setClientError('Password must be at least 10 characters and mix letters with numbers or symbols.');
      return false;
    }
    if (form.password !== form.confirmPassword) {
      setClientError('Passwords do not match.');
      return false;
    }
    setClientError(null);
    return true;
  };

  const handleStep1Next = (e: FormEvent) => {
    e.preventDefault();
    if (!validateStep1()) return;

    if (inviteToken) {
      // If registering with invite token, submit directly (no workspace step needed)
      registerMutation.mutate(undefined, {
        onSuccess: (me) => {
          signedIn(me);
          navigate('/');
        }
      });
      return;
    }

    onStepChange?.(2);
  };

  const handleStep2Submit = (e: FormEvent) => {
    e.preventDefault();
    registerMutation.mutate(undefined, {
      onSuccess: (me) => {
        setRegisteredMe(me);
        onStepChange?.(3);
      }
    });
  };

  const handleLoginSubmit = (e: FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  const handleCreateProduct = async () => {
    if (!productForm.name.trim() || !registeredMe) return;
    try {
      const res = await createProductMutation.mutateAsync({
        name: productForm.name.trim(),
        category: productForm.category.trim() || undefined,
        targetSellingPrice: productForm.targetPrice ? Number(productForm.targetPrice) : null
      });
      signedIn(registeredMe);
      navigate(`/products/${res.data.id}`);
    } catch {
      // handled by mutation error
    }
  };

  const handleLoadSamples = async () => {
    if (!registeredMe) return;
    try {
      await loadSamplesMutation.mutateAsync();
      signedIn(registeredMe);
      navigate('/');
    } catch {
      // handled by mutation error
    }
  };

  const handleSkip = () => {
    if (!registeredMe) return;
    signedIn(registeredMe);
    navigate('/');
  };

  const next = params.get('next');
  const signupClosed = mode === 'register' && !inviteToken && cfg.data && !cfg.data.allowSignup;

  if (signupClosed) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Sign up is invite-only</h1>
        <p className="mt-1.5 text-sm text-zinc-500">New workspaces cannot be created directly on this server.</p>
        <div className="mt-8 rounded-lg border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
          Sign-up is invite-only on this server. Ask your administrator for an invite link to join an existing workspace.
        </div>
        <p className="mt-6 text-center text-sm text-zinc-500">
          Already have an account?{' '}
          <Link className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
            Sign in
          </Link>
        </p>
      </>
    );
  }

  // ── Mode: Login ──────────────────────────────────────────────────────────
  if (mode === 'login') {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-zinc-500">Sign in to keep your products moving.</p>

        <form onSubmit={handleLoginSubmit} className="mt-8 space-y-4">
          <Field label="Work email" htmlFor="login-email">
            <Input
              id="login-email"
              type="email"
              autoComplete="username"
              spellCheck={false}
              required
              value={form.email}
              onChange={set('email')}
              placeholder="you@company.com"
            />
          </Field>
          <Field label="Password" htmlFor="login-password">
            <div className="relative">
              <Input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={form.password}
                onChange={set('password')}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          <ErrorText error={loginMutation.error} />

          <Button type="submit" className="w-full" loading={loginMutation.isPending}>
            Sign in
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-500">
          New here?{' '}
          <Link className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" to={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
            Create an account
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-zinc-400">Forgot your password? Ask a workspace admin for a reset link.</p>
      </>
    );
  }

  // ── Mode: Register (Multi-Step Flow) ──────────────────────────────────────
  return (
    <>
      {!inviteToken && <StepIndicator currentStep={step} />}

      {step === 1 && (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">
            {inviteToken ? 'Join workspace' : 'Create your account'}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {inviteToken
              ? 'Complete your profile details to join the workspace.'
              : 'Step 1 of 3 · Your personal details'}
          </p>

          <form onSubmit={handleStep1Next} className="mt-6 space-y-4">
            <Field label="Your name" htmlFor="register-name">
              <Input
                id="register-name"
                autoComplete="name"
                required
                value={form.name}
                onChange={set('name')}
                placeholder="Maya Patel"
              />
            </Field>

            <Field label="Work email" htmlFor="register-email">
              <Input
                id="register-email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                required
                value={form.email}
                onChange={set('email')}
                placeholder="you@company.com"
              />
            </Field>

            <Field
              label="Password"
              htmlFor="register-password"
              hint="At least 10 characters, mixing letters with numbers or symbols."
            >
              <div className="relative">
                <Input
                  id="register-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={form.password}
                  onChange={set('password')}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {form.password.length > 0 && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex flex-1 gap-1">
                      {[1, 2, 3].map((barIdx) => {
                        const active = passwordStrength.score >= barIdx;
                        const color =
                          passwordStrength.score === 1
                            ? 'bg-rose-500'
                            : passwordStrength.score === 2
                              ? 'bg-amber-500'
                              : 'bg-emerald-500';
                        return (
                          <div
                            key={barIdx}
                            className={`h-1.5 flex-1 rounded-full transition-colors ${
                              active ? color : 'bg-zinc-200 dark:bg-zinc-800'
                            }`}
                          />
                        );
                      })}
                    </div>
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      {passwordStrength.label}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <span
                      className={`flex items-center gap-1 ${
                        passwordStrength.hasMinLength
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          passwordStrength.hasMinLength ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                      />
                      10+ characters
                    </span>
                    <span
                      className={`flex items-center gap-1 ${
                        passwordStrength.hasBoth
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          passwordStrength.hasBoth ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
                        }`}
                      />
                      Letters & numbers/symbols
                    </span>
                  </div>
                </div>
              )}
            </Field>

            <Field label="Confirm password" htmlFor="confirm-password">
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  value={form.confirmPassword}
                  onChange={set('confirmPassword')}
                  className="pr-10"
                  placeholder="Repeat your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {form.confirmPassword.length > 0 && (
                <div className="mt-1">
                  {form.confirmPassword === form.password ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3 w-3 stroke-[2.5]" /> Passwords match
                    </span>
                  ) : (
                    <span className="text-xs text-rose-500">Passwords do not match</span>
                  )}
                </div>
              )}
            </Field>

            {clientError && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{clientError}</p>}
            <ErrorText error={registerMutation.error} />

            <Button
              type="submit"
              className="w-full"
              loading={registerMutation.isPending}
            >
              {inviteToken ? 'Join workspace' : 'Continue to Workspace →'}
            </Button>
          </form>

          {!inviteToken && (
            <p className="mt-6 text-center text-sm text-zinc-500">
              Already have an account?{' '}
              <Link className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>
                Sign in
              </Link>
            </p>
          )}
        </>
      )}

      {step === 2 && (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">Set up your workspace</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Step 2 of 3 · Where you and your team will collaborate</p>

          <form onSubmit={handleStep2Submit} className="mt-6 space-y-4">
            <Field
              label="Workspace name"
              htmlFor="ws"
              hint={`Defaults to "${suggestedWorkspaceName}" if left blank`}
            >
              <Input
                id="ws"
                value={form.workspaceName}
                onChange={set('workspaceName')}
                placeholder={suggestedWorkspaceName}
              />
            </Field>

            <Field label="Primary currency" htmlFor="cur" hint="Currency used for costs, pricing and margins.">
              <Select
                id="cur"
                value={form.currency}
                onChange={set('currency')}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} ({currencySymbol(c)})
                  </option>
                ))}
              </Select>
            </Field>

            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3.5 text-xs text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/20 dark:text-indigo-200">
              <div className="flex items-center gap-2 font-medium">
                <Building2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Workspace summary</span>
              </div>
              <p className="mt-1 text-indigo-700/80 dark:text-indigo-300/80">
                You’ll start as owner of <strong>{form.workspaceName.trim() || suggestedWorkspaceName}</strong> with currency <strong>{form.currency} ({currencySymbol(form.currency)})</strong>. You can invite team members anytime.
              </p>
            </div>

            <ErrorText error={registerMutation.error} />

            <div className="flex gap-2 pt-2">
              <Button
                variant="secondary"
                type="button"
                onClick={() => onStepChange?.(1)}
                icon={<ArrowLeft className="h-4 w-4" />}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                loading={registerMutation.isPending}
              >
                Create Account & Continue →
              </Button>
            </div>
          </form>
        </>
      )}

      {step === 3 && registeredMe && (
        <div className="space-y-6">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" /> Account created successfully
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">
              Welcome, {form.name.trim().split(' ')[0]}!
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Your workspace <strong>{registeredMe.workspace.name}</strong> is live. Choose how you’d like to begin:
            </p>
          </div>

          <div className="rounded-xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/60 to-purple-50/30 p-5 dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-zinc-900">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <Sparkles className="h-4 w-4" />
              <span>Option 1 · Start with your product</span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-white">Create your first product</h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Answer quick discovery questions, track component costs, and earn XP as you level it up.
            </p>

            <div className="mt-4 space-y-3">
              <Field label="Product name" htmlFor="product-name">
                <Input
                  id="product-name"
                  placeholder="e.g. Ergonomic Standing Desk"
                  value={productForm.name}
                  onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Category" htmlFor="product-cat">
                  <Input
                    id="product-cat"
                    placeholder="e.g. Hardware"
                    value={productForm.category}
                    onChange={(e) => setProductForm((f) => ({ ...f, category: e.target.value }))}
                  />
                </Field>
                <Field label={`Target price (${currencySymbol(form.currency)})`} htmlFor="product-price">
                  <Input
                    id="product-price"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="99.00"
                    value={productForm.targetPrice}
                    onChange={(e) => setProductForm((f) => ({ ...f, targetPrice: e.target.value }))}
                  />
                </Field>
              </div>
              <ErrorText error={createProductMutation.error} />
              <Button
                onClick={handleCreateProduct}
                loading={createProductMutation.isPending}
                disabled={!productForm.name.trim()}
                className="w-full"
                icon={<Plus className="h-4 w-4" />}
              >
                Create product & start (+50 XP)
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-5 dark:border-zinc-800 dark:bg-zinc-900/40">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              <Wand2 className="h-4 w-4" />
              <span>Option 2 · Guided Tour</span>
            </div>
            <h3 className="mt-1 text-base font-semibold text-zinc-900 dark:text-white">Explore with sample products</h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Pre-load realistic products, materials, suppliers, and smart suggestions to see everything in action.
            </p>
            <ErrorText error={loadSamplesMutation.error} />
            <div className="mt-4">
              <Button
                variant="secondary"
                onClick={handleLoadSamples}
                loading={loadSamplesMutation.isPending}
                className="w-full"
                icon={<Wand2 className="h-4 w-4" />}
              >
                Load sample workspace
              </Button>
            </div>
          </div>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              I’ll set up products later, take me to dashboard →
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);

  return (
    <Shell wide={mode === 'register' && step === 3}>
      <AuthForm mode={mode} step={step} onStepChange={setStep} />
    </Shell>
  );
}

export function JoinPage() {
  const { token = '' } = useParams();
  const me = useMe();
  const navigate = useNavigate();
  const signedIn = useSignedIn();
  const invite = useQuery({
    queryKey: ['invite', token],
    queryFn: () => get<{ workspaceName: string; role: string }>(`/auth/invite/${token}`),
    retry: false
  });
  const accept = useMutation({
    mutationFn: () => post<Me>('/auth/accept-invite', { token }),
    onSuccess: (m) => {
      signedIn(m);
      navigate('/');
    }
  });

  if (invite.isLoading || me.isLoading) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  }

  if (invite.error) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Invite not valid</h1>
        <p className="mt-2 text-sm text-zinc-500">{(invite.error as ApiError).message}</p>
        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400">
          Go to sign in →
        </Link>
      </Shell>
    );
  }
  const ws = invite.data!.workspaceName;

  if (me.data) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Join {ws}</h1>
        <p className="mt-2 text-sm text-zinc-500">
          You are signed in as {me.data.user.email}. Join <strong>{ws}</strong> as a {invite.data!.role}?
        </p>
        <ErrorText error={accept.error} />
        <div className="mt-6 flex gap-2">
          <Button onClick={() => accept.mutate()} loading={accept.isPending} icon={<CheckCircle2 className="h-4 w-4" />}>
            Join workspace
          </Button>
          <Button variant="secondary" onClick={() => navigate('/')}>
            Not now
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-6 rounded-lg border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">
        You’ve been invited to join <strong>{ws}</strong>.
      </div>
      <AuthForm mode="register" inviteToken={token} />
      <p className="mt-6 text-center text-sm text-zinc-500">
        Already have an account?{' '}
        <Link className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" to={`/login?next=${encodeURIComponent(`/join/${token}`)}`}>
          Sign in to join
        </Link>
      </p>
    </Shell>
  );
}

export function ResetPage() {
  const { token = '' } = useParams();
  const signedIn = useSignedIn();
  const [password, setPassword] = useState('');
  const info = useQuery({ queryKey: ['reset', token], queryFn: () => get<{ email: string }>(`/auth/reset/${token}`), retry: false });
  const submit = useMutation({ mutationFn: () => post<Me | undefined>('/auth/reset', { token, newPassword: password }), onSuccess: (m) => m && signedIn(m) });

  if (info.isLoading) {
    return (
      <Shell>
        <Spinner />
      </Shell>
    );
  }
  if (info.error) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold tracking-tight">Link expired</h1>
        <p className="mt-2 text-sm text-zinc-500">{(info.error as Error).message}</p>
        <Link to="/login" className="mt-6 inline-block text-sm font-medium text-indigo-600 dark:text-indigo-400">
          Go to sign in →
        </Link>
      </Shell>
    );
  }
  return (
    <Shell>
      <h1 className="text-2xl font-semibold tracking-tight">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-zinc-500">For {info.data!.email}. You’ll be signed out everywhere else.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit.mutate();
        }}
      >
        <Field label="New password" htmlFor="np" hint="At least 10 characters, mixing letters with numbers or symbols.">
          <Input id="np" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <ErrorText error={submit.error} />
        <Button type="submit" className="w-full" loading={submit.isPending}>
          Set password and sign in
        </Button>
      </form>
    </Shell>
  );
}
