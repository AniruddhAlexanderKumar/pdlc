import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ArrowRight, Compass, Rocket, Sparkles } from 'lucide-react';
import {
  STARTING_POINT_DESCRIPTIONS,
  STARTING_POINT_LABELS,
  STARTING_POINT_STAGES,
  type Me,
  type OnboardingState,
  type OnboardingStartingPoint
} from '@sv/shared';
import { post } from '../api/client';
import { useResetSession, useSession } from '../api/hooks';
import { Button, Card } from '../components/ui';

/**
 * The two-question onboarding, also reachable after registration when the
 * founder skipped it (or for accounts created before open registration).
 *
 * It is deliberately not a paywall, a plan chooser or a wizard: it asks what the
 * founder is building and whether they are starting from scratch, then drops
 * them into the stage of the PDLC progression those answers imply.
 */
export function OnboardingPage() {
  const me = useSession();
  const resetSession = useResetSession();
  const navigate = useNavigate();
  const [building, setBuilding] = useState(me.onboarding?.building ?? '');
  const [startingPoint, setStartingPoint] = useState<OnboardingStartingPoint>(me.onboarding?.startingPoint ?? 'scratch');
  const [error, setError] = useState('');

  const finish = useMutation({
    mutationFn: () =>
      post<{ onboarding: OnboardingState; productId: string | null; me: Me }>('/auth/onboarding', {
        building: building.trim(),
        startingPoint
      }),
    onSuccess: (result) => {
      resetSession(result.me);
      navigate(result.productId ? `/products/${result.productId}` : '/', { replace: true });
    },
    onError: (caught) => setError(caught instanceof Error ? caught.message : 'Could not save your answers.')
  });

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 md:px-8">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-blue-700 dark:text-blue-400">Welcome to Solution Velocity</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Start your product development journey</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
        Two quick answers decide where your first product enters the lifecycle. You can change everything later —
        this is a starting point, not a commitment.
      </p>

      <form
        className="mt-8 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!building.trim()) {
            setError('Tell us what you are building to continue.');
            return;
          }
          setError('');
          finish.mutate();
        }}
      >
        <Card className="p-5">
          <label htmlFor="onboarding-building" className="flex items-center gap-2 text-sm font-semibold">
            <Rocket className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            What are you building?
          </label>
          <p className="mt-1 text-xs text-zinc-500">A product, a system, a service — whatever you are trying to get to market.</p>
          <input
            id="onboarding-building"
            value={building}
            onChange={(event) => { setError(''); setBuilding(event.target.value); }}
            maxLength={120}
            placeholder="e.g. A modular robot arm for small workshops"
            className="mt-3 w-full rounded-md border border-zinc-300 bg-white p-2.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </Card>

        <Card className="p-5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Compass className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            Where are you starting from?
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['scratch', 'existing'] as const).map((value) => (
              <label
                key={value}
                className={`cursor-pointer rounded-lg border p-3 ${startingPoint === value ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-zinc-200 dark:border-zinc-700'}`}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="startingPoint"
                    value={value}
                    checked={startingPoint === value}
                    onChange={() => setStartingPoint(value)}
                  />
                  {STARTING_POINT_LABELS[value]}
                </span>
                <span className="mt-1 block text-xs text-zinc-500">{STARTING_POINT_DESCRIPTIONS[value]}</span>
                <span className="mt-2 block text-[11px] font-medium text-blue-700 dark:text-blue-400">
                  Starts in {STARTING_POINT_STAGES[value]}
                </span>
              </label>
            ))}
          </div>
        </Card>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={finish.isPending} icon={<Sparkles className="h-4 w-4" />}>
            Start my journey <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Skip for now
          </button>
        </div>
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{error}</p>}
        {finish.isError && <p role="alert" className="text-sm text-rose-700 dark:text-rose-400">{(finish.error as Error).message}</p>}
      </form>
    </div>
  );
}
