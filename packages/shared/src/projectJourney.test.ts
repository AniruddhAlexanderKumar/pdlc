import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  JOURNEY_ACTIVITY_KIND_LABELS,
  JOURNEY_ACTIVITY_KINDS,
  JOURNEY_TEMPLATES,
  JOURNEY_TEMPLATES_BY_ID,
  deriveJourneyView,
  journeyTemplate,
  type JourneyActivity,
  type JourneyIssue,
  type JourneyTemplateId
} from './projectJourney.js';

function activity(overrides: Partial<JourneyActivity> & { id: string; stageId: string; title: string }): JourneyActivity {
  return {
    kind: 'requirement',
    description: '',
    status: 'not_started',
    priority: 'Medium',
    assigneeId: null,
    assigneeName: null,
    dueAt: null,
    position: 0,
    blockedReason: '',
    reviewState: 'none',
    reviewedByName: null,
    reviewNote: '',
    completedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    waitingOn: [],
    artifacts: [],
    ...overrides
  };
}

test('every journey template has stages with at least one activity each', () => {
  assert.equal(JOURNEY_TEMPLATES.length, 4);
  for (const id of JOURNEY_TEMPLATES) {
    const template = JOURNEY_TEMPLATES_BY_ID[id];
    assert.equal(template.id, id);
    assert.ok(template.stages.length >= 3, `${id} should have at least 3 stages`);
    assert.ok(template.label.length > 0);
    const names = new Set<string>();
    for (const stage of template.stages) {
      assert.ok(!names.has(stage.name), `${id}: duplicate stage ${stage.name}`);
      names.add(stage.name);
      assert.ok(stage.activities.length >= 1, `${id}/${stage.name} needs at least one activity`);
      for (const item of stage.activities) {
        assert.ok(JOURNEY_ACTIVITY_KINDS.includes(item.kind), `${id}: unknown kind ${item.kind}`);
        assert.ok(item.title.trim().length > 0);
        assert.ok(item.description.trim().length > 0);
      }
    }
  }
});

test('unknown template ids fall back to the general lifecycle', () => {
  assert.equal(journeyTemplate('nonsense').id, 'general');
  assert.equal(journeyTemplate(undefined).id, 'general');
  assert.equal(journeyTemplate('hardware').id, 'hardware');
});

test('deriveJourneyView computes completed, active, blocked and upcoming stages', () => {
  const stages = [
    { id: 's1', name: 'One', description: '', position: 0 },
    { id: 's2', name: 'Two', description: '', position: 1 },
    { id: 's3', name: 'Three', description: '', position: 2 },
    { id: 's4', name: 'Four', description: '', position: 3 }
  ];
  const activities: JourneyActivity[] = [
    // Stage 1 complete: one completed activity and a Done task.
    activity({ id: 'a1', stageId: 's1', title: 'Done activity', status: 'completed', position: 0 }),
    // Stage 2 blocked: one blocked activity.
    activity({ id: 'a2', stageId: 's2', title: 'Blocked activity', status: 'blocked', blockedReason: 'Waiting on supplier', position: 0 }),
    // Stage 3 active: one ready activity.
    activity({ id: 'a3', stageId: 's3', title: 'Ready activity', position: 0 }),
    // Stage 4 upcoming: waiting on a3.
    activity({ id: 'a4', stageId: 's4', title: 'Dependent activity', position: 0 })
  ];
  activities[3]!.waitingOn = [{ id: 'a3', title: 'Ready activity', status: 'not_started' }];
  const issues: JourneyIssue[] = [
    { id: 'i1', stageId: 's1', key: 'P-1', summary: 'Shipped task', status: 'Done', priority: 'Medium', assigneeName: null }
  ];

  const view = deriveJourneyView({
    journey: { id: 'j1', projectId: 'p1', name: 'Journey', template: 'general' },
    stages,
    activities,
    issues
  });

  assert.equal(view.stages[0]!.state, 'completed');
  assert.equal(view.stages[0]!.percent, 100);
  assert.equal(view.stages[1]!.state, 'blocked');
  assert.equal(view.stages[2]!.state, 'upcoming');
  assert.equal(view.stages[3]!.state, 'upcoming');

  assert.equal(view.summary.stagesTotal, 4);
  assert.equal(view.summary.stagesCompleted, 1);
  assert.equal(view.summary.blockers, 1);
  // 5 units total (4 activities + 1 issue), 2 completed.
  assert.equal(view.summary.percent, 40);
  // The blocked activity is not a next action; the ready one in stage 3 is.
  assert.equal(view.summary.nextAction?.activityId, 'a3');
  assert.equal(view.summary.nextAction?.stageName, 'Three');
});

test('a blocked first incomplete stage is marked blocked, not active', () => {
  const view = deriveJourneyView({
    journey: { id: 'j1', projectId: 'p1', name: 'Journey', template: 'general' },
    stages: [
      { id: 's1', name: 'One', description: '', position: 0 },
      { id: 's2', name: 'Two', description: '', position: 1 }
    ],
    activities: [
      activity({ id: 'a1', stageId: 's1', title: 'Stuck', status: 'blocked' }),
      activity({ id: 'a2', stageId: 's2', title: 'Later', position: 0 })
    ],
    issues: []
  });
  const rederived = deriveJourneyView({
    journey: { id: 'j1', projectId: 'p1', name: 'Journey', template: 'general' },
    stages: [
      { id: 's1', name: 'One', description: '', position: 0 },
      { id: 's2', name: 'Two', description: '', position: 1 }
    ],
    activities: [
      activity({ id: 'a1', stageId: 's1', title: 'Stuck', status: 'blocked' }),
      activity({
        id: 'a2',
        stageId: 's2',
        title: 'Later',
        position: 0,
        waitingOn: [{ id: 'a1', title: 'Stuck', status: 'blocked' }]
      })
    ],
    issues: []
  });
  assert.equal(view.stages[0]!.state, 'blocked');
  assert.equal(view.stages[1]!.state, 'upcoming');
  assert.equal(rederived.stages[0]!.state, 'blocked');
  assert.equal(rederived.summary.nextAction, null);
});

test('deriveJourneyView surfaces pending approvals and orders milestones by due date', () => {
  const view = deriveJourneyView({
    journey: { id: 'j1', projectId: 'p1', name: 'Journey', template: 'hardware' },
    stages: [{ id: 's1', name: 'One', description: '', position: 0 }],
    activities: [
      activity({ id: 'a1', stageId: 's1', title: 'Sign-off', kind: 'approval', reviewState: 'pending' }),
      activity({ id: 'a2', stageId: 's1', title: 'Late milestone', kind: 'milestone', dueAt: '2026-06-01T00:00:00.000Z', position: 1 }),
      activity({ id: 'a3', stageId: 's1', title: 'Early milestone', kind: 'milestone', dueAt: '2026-03-01T00:00:00.000Z', position: 2 }),
      activity({ id: 'a4', stageId: 's1', title: 'Shipped milestone', kind: 'milestone', status: 'completed', position: 3 })
    ],
    issues: []
  });
  assert.equal(view.summary.pendingApprovals, 1);
  assert.deepEqual(
    view.summary.upcomingMilestones.map((m) => m.title),
    ['Early milestone', 'Late milestone']
  );
  assert.equal(view.journey.templateLabel, JOURNEY_TEMPLATES_BY_ID.hardware.label);
  assert.equal(Object.keys(JOURNEY_ACTIVITY_KIND_LABELS).length, JOURNEY_ACTIVITY_KINDS.length);
});

test('journey template ids are a closed set used by project creation', () => {
  const ids: JourneyTemplateId[] = ['hardware', 'software', 'research', 'general'];
  assert.deepEqual([...JOURNEY_TEMPLATES], ids);
});
