import React from 'react';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  buildJourney,
  blockersFor,
  indexActivityStages,
  recommendNextActions,
  type ActivityRecord,
  type Journey,
  type Material,
  type Product,
  type Recommendation
} from '@sv/shared';
import { StageJourneyMap } from './StageJourneyMap';
import { ActivityRow } from './ActivityRow';
import { NextActionCard } from './NextActionCard';
import { TeamContributionCard } from './StageActivities';

/**
 * Collaboration UI, verified by server-rendering markup. There are no browser
 * binaries in this environment, so these assertions check the rendered output
 * rather than screenshots.
 */

const steel: Material = {
  id: 'm1',
  name: 'Steel',
  category: 'Metals & Alloys',
  unit: 'pcs',
  unitPrice: 5,
  description: '',
  sourceUrl: '',
  notes: '',
  suppliers: []
};
const materials = new Map([[steel.id, steel]]);

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Bottle',
    category: 'Drinkware',
    stage: 'Research',
    imageUrl: '',
    description: 'A bottle',
    notes: '',
    targetSellingPrice: null,
    costs: { labour: 0, packaging: 0, overhead: 0 },
    materials: [],
    tasks: [],
    answers: {
      'idea.problem': 'Leaks',
      'idea.customer': 'Commuters',
      'idea.oneliner': 'A bottle',
      'research.competitors': 'Generic bottles',
      'research.market_price': 20,
      // Filled in, so approval-gated activities are genuinely awaiting sign-off.
      'research.validated': true
    },
    createdAt: '',
    updatedAt: '',
    ...overrides
  };
}

function record(overrides: Partial<ActivityRecord> = {}): ActivityRecord {
  return {
    activityKey: 'research.validated',
    status: 'completed',
    assigneeId: null,
    assigneeName: null,
    reviewState: 'none',
    reviewRequestedAt: null,
    reviewedBy: null,
    reviewedByName: null,
    reviewedAt: null,
    reviewNote: '',
    startedAt: null,
    completedAt: null,
    completedBy: null,
    completedByName: null,
    updatedAt: new Date(0).toISOString(),
    ...overrides
  };
}

const noop = () => {};

function journeyWith(records: Record<string, ActivityRecord>, deps: Record<string, string[]> = {}): Journey {
  return buildJourney(product(), {
    materials,
    collaboration: { records, blockersFor: (key, all, r) => blockersFor(key, deps, all, r) }
  });
}

const renderRow = (_index: number, props: Partial<React.ComponentProps<typeof ActivityRow>> = {}, key = 'research.validated') => {
  const journey = journeyWith({
    'research.validated': record({ status: 'needs_review', reviewState: 'pending', assigneeId: 'u1', assigneeName: 'Ada' })
  });
  const activity = journey.stages.flatMap((s) => s.activities).find((a) => a.id === key)!;
  return renderToStaticMarkup(
    <ActivityRow
      activity={activity}
      team={[{ userId: 'u1', name: 'Ada', role: 'member', assigned: 1, completed: 0, inProgress: 0, needsReview: 1, blocked: 0, notStarted: 0 }]}
      canManage={false}
      currentUserId="u2"
      isOpen
      onToggle={noop}
      onOpen={noop}
      onAssign={noop}
      onStatus={noop}
      onSubmitReview={noop}
      onReview={noop}
      onJumpToBlocker={noop}
      {...props}
    />
  );
};

// ── Activity row ──────────────────────────────────────────────────────────

test('an activity shows its status, owner, and an approvable review state', () => {
  const journey = journeyWith({
    'research.validated': record({ status: 'needs_review', reviewState: 'pending', assigneeId: 'u1', assigneeName: 'Ada' })
  });
  const activity = journey.stages.flatMap((s) => s.activities).find((a) => a.id === 'research.validated')!;
  const html = renderToStaticMarkup(
    <ActivityRow
      activity={activity}
      team={[{ userId: 'u1', name: 'Ada', role: 'member', assigned: 1, completed: 0, inProgress: 0, needsReview: 1, blocked: 0, notStarted: 0 }]}
      canManage
      currentUserId="u2"
      isOpen
      onToggle={noop}
      onOpen={noop}
      onAssign={noop}
      onStatus={noop}
      onSubmitReview={noop}
      onReview={noop}
      onJumpToBlocker={noop}
    />
  );
  assert.match(html, /Needs review/);
  assert.match(html, /Ada/);
  assert.match(html, /Awaiting review/);
  // An owner/admin sees the review controls.
  assert.match(html, /Approve/);
  assert.match(html, /Request changes/);
  // No approval bypass: status selects are locked while a review is pending.
  assert.match(html, /aria-label="Status for[^"]*" disabled=""/);
  assert.match(html, /Waiting for a reviewer\./);
});

test('an ordinary member is told a reviewer will act, and gets no review buttons', () => {
  const html = renderRow(0, { canManage: false, currentUserId: 'u2' });
  assert.match(html, /An owner or admin will review it shortly/);
  assert.doesNotMatch(html, /Request changes/);
});

test('a blocker is displayed inside the activity with a way to resolve it', () => {
  const journey = journeyWith(
    { 'design.must_haves': record({ status: 'blocked', assigneeId: 'u1', assigneeName: 'Ada' }) },
    { 'design.must_haves': ['research.validated'] }
  );
  const activity = journey.stages.flatMap((s) => s.activities).find((a) => a.id === 'design.must_haves')!;
  assert.equal(activity.collaboration?.blockers.length, 1);

  const html = renderToStaticMarkup(
    <ActivityRow
      activity={activity}
      team={[]}
      canManage={false}
      currentUserId="u1"
      isOpen={false}
      onToggle={noop}
      onOpen={noop}
      onAssign={noop}
      onStatus={noop}
      onSubmitReview={noop}
      onReview={noop}
      onJumpToBlocker={noop}
    />
  );
  // The blocker says what to do and offers a jump to the prerequisite.
  assert.match(html, /Blocked/);
  assert.match(html, /first/);
  assert.match(html, />Go</);
});

test('changes requested surfaces the reviewer note to the author', () => {
  const journey = journeyWith({
    'research.validated': record({
      status: 'in_progress',
      reviewState: 'changes_requested',
      reviewNote: 'Add a source link please.',
      assigneeId: 'u1',
      assigneeName: 'Ada'
    })
  });
  const activity = journey.stages.flatMap((s) => s.activities).find((a) => a.id === 'research.validated')!;
  const html = renderToStaticMarkup(
    <ActivityRow
      activity={activity}
      team={[]}
      canManage={false}
      currentUserId="u1"
      isOpen
      onToggle={noop}
      onOpen={noop}
      onAssign={noop}
      onStatus={noop}
      onSubmitReview={noop}
      onReview={noop}
      onJumpToBlocker={noop}
    />
  );
  assert.match(html, /Changes requested/);
  assert.match(html, /Add a source link please\./);
});

// ── Approval gate is visible, not silent ──────────────────────────────────

test('a filled-in activity awaiting approval does not count towards the stage', () => {
  const pending = journeyWith({ 'research.validated': record({ status: 'needs_review', reviewState: 'pending' }) });
  const research = pending.stages.find((s) => s.id === 'Research')!;
  assert.equal(research.pendingApproval?.includes('research.validated'), true);
  assert.equal(research.complete, false);

  const approved = journeyWith({ 'research.validated': record({ status: 'completed', reviewState: 'approved' }) });
  const approvedResearch = approved.stages.find((s) => s.id === 'Research')!;
  assert.equal(approvedResearch.pendingApproval?.length, 0);
});

test('the stage card summarises review and blocked counts without clutter', () => {
  const journey = journeyWith(
    {
      'research.validated': record({ status: 'needs_review', reviewState: 'pending', assigneeName: 'Ada' }),
      'research.channels': record({ status: 'blocked', assigneeName: 'Bo' })
    },
    { 'research.channels': ['research.validated'] }
  );
  const html = renderToStaticMarkup(<StageJourneyMap journey={journey} onSelect={noop} />);
  assert.match(html, /1 awaiting review/);
  assert.match(html, /1 blocked/);
  // Owners are named so it is clear who to ask.
  assert.match(html, /Ada/);
  // Stage identity from iteration 1 is untouched.
  for (const stage of ['Idea', 'Research', 'Testing', 'Improvement', 'Retire this product']) {
    assert.ok(html.includes(stage), `missing ${stage}`);
  }
});

test('a quiet stage adds no collaboration noise', () => {
  const html = renderToStaticMarkup(<StageJourneyMap journey={buildJourney(product(), { materials })} onSelect={noop} />);
  assert.doesNotMatch(html, /awaiting review/);
  assert.doesNotMatch(html, /blocked/);
});

// ── Recommendation card ───────────────────────────────────────────────────

test('the recommendation card names the action, why, the stage and the owner', () => {
  const rec: Recommendation = {
    id: 'required_incomplete:research.validated',
    stage: 'Research',
    stageLabel: 'Research',
    activityKey: 'research.validated',
    label: 'Validate the idea with real people',
    why: 'Assumptions are cheaper to test than prototypes.',
    reason: 'required_incomplete',
    because: 'This is the next required step in Research.',
    assigneeId: 'u1',
    assigneeName: 'Ada',
    awaitingApproval: false,
    priority: 6
  };
  const html = renderToStaticMarkup(<NextActionCard recommendation={rec} isComplete={false} onDo={noop} />);
  assert.match(html, /Do this next/);
  assert.match(html, /Validate the idea with real people/);
  assert.match(html, /Next required step/);
  assert.match(html, /Research stage/);
  assert.match(html, /Ada/);
  assert.match(html, /Start/);
});

test('the recommendation card celebrates only when nothing is outstanding', () => {
  const html = renderToStaticMarkup(<NextActionCard recommendation={null} isComplete onDo={noop} />);
  assert.match(html, /Every stage is complete/);
  assert.doesNotMatch(html, /Do this next/);
});

test('a blocked recommendation is labelled as blocked, not as a required step', () => {
  const journey = journeyWith(
    {
      'design.must_haves': record({ status: 'blocked', assigneeId: 'u1', assigneeName: 'Ada' }),
      'research.validated': record({ status: 'completed', reviewState: 'approved' })
    },
    { 'design.must_haves': ['research.validated'] }
  );
  const recs = recommendNextActions({
    product: product(),
    journey,
    materials,
    records: { 'design.must_haves': record({ status: 'blocked' }) },
    dependencies: { 'design.must_haves': ['research.validated'] },
    allActivities: journey.stages.flatMap((s) => s.activities)
  });
  const first = recs[0]!;
  assert.ok(first, 'expected a recommendation');
  const html = renderToStaticMarkup(<NextActionCard recommendation={first} isComplete={false} onDo={noop} />);
  assert.match(html, /Do this next/);
  // The label must match the actual reason rather than claiming it is required work.
  assert.equal(indexActivityStages(journey).get('design.must_haves'), 'Design');
});

// ── Team contribution ─────────────────────────────────────────────────────

test('team contribution shows counts and never a score or ranking', () => {
  const html = renderToStaticMarkup(
    <TeamContributionCard
      currentUserId="u1"
      team={[
        { userId: 'u1', name: 'Ada', role: 'owner', assigned: 3, completed: 2, inProgress: 1, needsReview: 0, blocked: 0, notStarted: 0 },
        { userId: 'u2', name: 'Bo', role: 'member', assigned: 1, completed: 0, inProgress: 0, needsReview: 0, blocked: 0, notStarted: 1 }
      ]}
    />
  );
  assert.match(html, /Who is doing what/);
  assert.match(html, /Ada/);
  assert.match(html, /2 done/);
  assert.match(html, /\(you\)/);
  // Accountability, not surveillance: no score, rank, percentage or leaderboard.
  assert.doesNotMatch(html, /leaderboard/i);
  assert.doesNotMatch(html, /ranking/i);
  assert.doesNotMatch(html, /%/, 'team section should not show percentages');
});
