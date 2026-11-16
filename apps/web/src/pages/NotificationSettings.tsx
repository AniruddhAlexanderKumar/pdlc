import { Bell, ShieldCheck } from 'lucide-react';
import type { NotificationPreference } from '@sv/shared';
import { useNotificationPreferences, useSaveNotificationPreferences } from '../api/collaboration';
import { Card, CardHeader, PageHeader, Spinner } from '../components/ui';

const OPTIONS: { key: keyof NotificationPreference; label: string; hint: string }[] = [
  {
    key: 'assignments',
    label: 'Assignments',
    hint: 'When an activity is assigned or reassigned to you.'
  },
  {
    key: 'reviews',
    label: 'Reviews',
    hint: 'When your work is submitted, approved, or sent back with changes.'
  },
  {
    key: 'blockers',
    label: 'Blockers clearing',
    hint: 'When something that was blocking your work is finished.'
  },
  {
    key: 'stages',
    label: 'Stage completions',
    hint: 'When a stage on a product in your workspace is finished.'
  }
];

/**
 * Notification preferences.
 *
 * Four toggles, no digest schedule, no channels matrix. Every change saves as you
 * toggle it, so there is nothing to submit and nothing to forget.
 */
export function NotificationSettings() {
  const { data, isLoading } = useNotificationPreferences();
  const save = useSaveNotificationPreferences();

  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle="We only tell you about things that need you. Turn off anything you would rather not hear about."
      />

      <div className="p-4 md:p-6">
      <Card>
        <CardHeader
          icon={<Bell className="h-4 w-4 text-zinc-400" />}
          title="What you are told about"
          subtitle={save.isPending ? 'Saving…' : 'Changes save automatically.'}
        />
        {isLoading || !data ? (
          <Spinner />
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {OPTIONS.map((o) => (
              <li key={o.key} className="flex items-start justify-between gap-4 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{o.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-zinc-500">{o.hint}</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label={o.label}
                    className="h-4 w-4 accent-[#16598d]"
                    checked={data[o.key]}
                    disabled={save.isPending}
                    onChange={(e) => save.mutate({ [o.key]: e.target.checked })}
                  />
                  <span className="w-7 text-[11px] tabular-nums text-zinc-500">{data[o.key] ? 'On' : 'Off'}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 flex items-start gap-2 rounded-xl border border-zinc-200 bg-white p-3.5 text-xs leading-5 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
        <span>
          These settings are yours alone and apply everywhere in this workspace. You are never notified about your own
          actions, and nothing here reports your activity to anyone else.
        </span>
      </p>
      </div>
    </div>
  );
}
