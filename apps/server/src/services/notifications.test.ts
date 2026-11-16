import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NotificationPreference } from '@sv/shared';
import { loadPreferences, notify, reviewersFor, savePreferences } from './notifications.js';

/**
 * Notifications are exercised against an in-memory fake of the two tables they
 * touch. There is no Postgres in this environment, so this verifies the rules we
 * own — de-duplication, actor exclusion, preference gating and payload shape —
 * rather than the SQL itself.
 */

interface PrefRow extends NotificationPreference {
  user_id: string;
}
interface NotifRow {
  workspace_id: string;
  user_id: string;
  kind: string;
  product_id: string | null;
  activity_key: string | null;
  title: string;
  body: string;
}

function fakeDb(prefs: PrefRow[] = []) {
  const inserted: NotifRow[] = [];
  const prefRows = [...prefs];

  const prefsQuery = (predicate?: (r: PrefRow) => boolean) => ({
    select: () => ({
      where: (col: 'user_id', op: string, val: string) => {
        assert.equal(col, 'user_id');
        assert.equal(op, '=');
        return {
          executeTakeFirst: async () =>
            prefRows.find((r) => r.user_id === val) ?? undefined
        };
      }
    })
  });

  const db = {
    selectFrom: (table: string) => {
      if (table !== 'notification_preferences') throw new Error(`unexpected table ${table}`);
      return prefsQuery();
    },
    insertInto: (table: string) => {
      if (table === 'notifications') {
        return {
          values: (rows: NotifRow | NotifRow[]) => ({
            execute: async () => {
              inserted.push(...(Array.isArray(rows) ? rows : [rows]));
            }
          })
        };
      }
      if (table === 'notification_preferences') {
        return {
          values: (row: PrefRow) => ({
            onConflict: () => ({
              execute: async () => {
                const i = prefRows.findIndex((r) => r.user_id === row.user_id);
                if (i >= 0) prefRows[i] = row;
                else prefRows.push(row);
              }
            })
          })
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };

  // The service only uses the query builder surface exercised above.
  return { db: db as never, inserted, prefRows };
}

const ALL_ON: NotificationPreference = { assignments: true, reviews: true, blockers: true, stages: true };

describe('notifications', () => {
  it('defaults to everything enabled when no preference row exists', async () => {
    const { db } = fakeDb();
    assert.deepEqual(await loadPreferences(db, 'u1'), ALL_ON);
  });

  it('never notifies the person who performed the action', async () => {
    const { db, inserted } = fakeDb();
    const n = await notify(db, {
      workspaceId: 'w1',
      recipientIds: ['actor', 'other'],
      actorId: 'actor',
      kind: 'activity_assigned',
      title: 'New activity assigned'
    });
    assert.equal(n, 1);
    assert.deepEqual(inserted.map((r) => r.user_id), ['other']);
  });

  it('notifies a recipient once even if listed twice', async () => {
    const { db, inserted } = fakeDb();
    const n = await notify(db, {
      workspaceId: 'w1',
      recipientIds: ['u2', 'u2', 'u2'],
      actorId: 'u1',
      kind: 'review_requested',
      title: 'Needs review'
    });
    assert.equal(n, 1);
    assert.equal(inserted.length, 1);
  });

  it('honours the preference that governs the notification kind', async () => {
    // Reviews are off for u2, assignments are on.
    const { db, inserted } = fakeDb([{ user_id: 'u2', ...ALL_ON, reviews: false }]);
    const reviewCount = await notify(db, {
      workspaceId: 'w1',
      recipientIds: ['u2'],
      actorId: 'u1',
      kind: 'review_approved',
      title: 'Approved'
    });
    assert.equal(reviewCount, 0);

    const assignCount = await notify(db, {
      workspaceId: 'w1',
      recipientIds: ['u2'],
      actorId: 'u1',
      kind: 'activity_assigned',
      title: 'Assigned'
    });
    assert.equal(assignCount, 1);
    assert.equal(inserted.length, 1);
  });

  it('maps every kind to the right toggle', async () => {
    const cases: [Parameters<typeof notify>[1]['kind'], keyof NotificationPreference][] = [
      ['activity_assigned', 'assignments'],
      ['activity_reassigned', 'assignments'],
      ['review_requested', 'reviews'],
      ['review_approved', 'reviews'],
      ['review_changes_requested', 'reviews'],
      ['blocker_resolved', 'blockers'],
      ['stage_completed', 'stages']
    ];
    for (const [kind, toggle] of cases) {
      const { db, inserted } = fakeDb([{ user_id: 'u2', ...ALL_ON, [toggle]: false }]);
      const n = await notify(db, { workspaceId: 'w1', recipientIds: ['u2'], actorId: 'u1', kind, title: 't' });
      assert.equal(n, 0, `${kind} should be suppressed when ${toggle} is off`);
      assert.equal(inserted.length, 0);
    }
  });

  it('does nothing when there is nobody to tell', async () => {
    const { db, inserted } = fakeDb();
    const n = await notify(db, { workspaceId: 'w1', recipientIds: [], actorId: 'u1', kind: 'stage_completed', title: 't' });
    assert.equal(n, 0);
    assert.equal(inserted.length, 0);
  });

  it('stores the context needed to navigate to the activity', async () => {
    const { db, inserted } = fakeDb();
    await notify(db, {
      workspaceId: 'w1',
      recipientIds: ['u2'],
      actorId: 'u1',
      kind: 'blocker_resolved',
      title: 'Unblocked',
      body: 'Design specs are ready',
      productId: 'p1',
      activityKey: 'design.must_haves'
    });
    assert.deepEqual(inserted[0], {
      workspace_id: 'w1',
      user_id: 'u2',
      kind: 'blocker_resolved',
      product_id: 'p1',
      activity_key: 'design.must_haves',
      title: 'Unblocked',
      body: 'Design specs are ready'
    });
  });

  it('round-trips saved preferences', async () => {
    const { db, prefRows } = fakeDb();
    await savePreferences(db, 'u1', { ...ALL_ON, blockers: false });
    assert.equal(prefRows.length, 1);
    assert.equal((await loadPreferences(db, 'u1')).blockers, false);
    // Saving again updates rather than duplicating.
    await savePreferences(db, 'u1', { ...ALL_ON, stages: false, blockers: false });
    assert.equal(prefRows.length, 1);
    const saved = await loadPreferences(db, 'u1');
    assert.equal(saved.stages, false);
    assert.equal(saved.blockers, false);
  });
});

describe('reviewersFor', () => {
  const members = [
    { userId: 'owner', role: 'owner' },
    { userId: 'admin', role: 'admin' },
    { userId: 'member', role: 'member' }
  ];

  it('picks owners and admins only', () => {
    assert.deepEqual(reviewersFor('member', members, 'member'), ['owner', 'admin']);
  });

  it('never suggests the submitter as their own reviewer', () => {
    assert.deepEqual(reviewersFor('owner', members, 'owner'), ['admin']);
  });
});
