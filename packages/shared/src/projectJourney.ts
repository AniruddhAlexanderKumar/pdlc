/**
 * Journey-first project model.
 *
 * Every project owns exactly one Journey: an ordered list of stages, each
 * holding activities (requirements, milestones, deliverables, documents,
 * approvals, decisions, risks). Tasks stay where they already live — as
 * project issues — and attach to a stage so they appear inside the Journey.
 *
 * Progress is always *derived* from activity and issue state; nothing here
 * stores a cached percentage that could drift from the records.
 */
import type { IssuePriority, IssueStatus } from './projects.js';

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const JOURNEY_TEMPLATES = ['hardware', 'software', 'research', 'general'] as const;
export type JourneyTemplateId = (typeof JOURNEY_TEMPLATES)[number];

export const JOURNEY_ACTIVITY_KINDS = ['requirement', 'milestone', 'deliverable', 'document', 'approval', 'decision', 'risk'] as const;
export type JourneyActivityKind = (typeof JOURNEY_ACTIVITY_KINDS)[number];

export const JOURNEY_ACTIVITY_STATUSES = ['not_started', 'in_progress', 'blocked', 'in_review', 'completed'] as const;
export type JourneyActivityStatus = (typeof JOURNEY_ACTIVITY_STATUSES)[number];

export const JOURNEY_REVIEW_STATES = ['none', 'pending', 'approved', 'changes_requested'] as const;
export type JourneyReviewState = (typeof JOURNEY_REVIEW_STATES)[number];

/** How a stage reads on the path: done, current, needs attention, or locked behind earlier work. */
export type JourneyStageState = 'completed' | 'active' | 'blocked' | 'upcoming';

export const JOURNEY_ACTIVITY_KIND_LABELS: Record<JourneyActivityKind, string> = {
  requirement: 'Requirement',
  milestone: 'Milestone',
  deliverable: 'Deliverable',
  document: 'Document',
  approval: 'Approval',
  decision: 'Decision',
  risk: 'Risk'
};

// ── Lifecycle templates ─────────────────────────────────────────────────────

export interface JourneyTemplateActivity {
  kind: JourneyActivityKind;
  title: string;
  description: string;
}

export interface JourneyTemplateStage {
  name: string;
  description: string;
  activities: JourneyTemplateActivity[];
}

export interface JourneyTemplate {
  id: JourneyTemplateId;
  label: string;
  description: string;
  stages: JourneyTemplateStage[];
}

const HARDWARE: JourneyTemplate = {
  id: 'hardware',
  label: 'Hardware product development',
  description: 'From problem definition through detailed design, prototyping and validation.',
  stages: [
    {
      name: 'Discover & Define',
      description: 'Understand the problem, the users and the opportunity before designing anything.',
      activities: [
        { kind: 'requirement', title: 'Capture the problem and target user', description: 'State who hurts, how often, and what “solved” looks like.' },
        { kind: 'decision', title: 'Confirm project scope', description: 'Record what is in scope for this project and what is explicitly out.' },
        { kind: 'deliverable', title: 'Problem statement and use cases', description: 'A short document the whole team can align on.' }
      ]
    },
    {
      name: 'Requirements & Feasibility',
      description: 'Turn the problem into testable requirements and check the risky assumptions.',
      activities: [
        { kind: 'requirement', title: 'Draft functional requirements', description: 'Measurable functions the product must perform.' },
        { kind: 'risk', title: 'Log technical feasibility risks', description: 'Anything that could make the concept impossible or too expensive.' },
        { kind: 'approval', title: 'Requirements baseline review', description: 'Stakeholders agree the requirements are ready to design against.' }
      ]
    },
    {
      name: 'Concept Design',
      description: 'Explore candidate concepts and choose one to develop.',
      activities: [
        { kind: 'deliverable', title: 'Concept sketches and architecture', description: 'At least two candidate concepts with a block architecture.' },
        { kind: 'decision', title: 'Select the preferred concept', description: 'Record why this concept won and what was rejected.' },
        { kind: 'approval', title: 'Concept design review', description: 'Gate before investing in detailed design.' }
      ]
    },
    {
      name: 'Detailed Design',
      description: 'Produce the complete definition of the product: drawings, materials, BOM.',
      activities: [
        { kind: 'deliverable', title: 'Detailed CAD and drawings', description: 'Released geometry with the dimensions that matter.' },
        { kind: 'deliverable', title: 'Bill of materials', description: 'Every part, quantity and target cost.' },
        { kind: 'requirement', title: 'Specify materials and tolerances', description: 'Materials, finishes and tolerances the supplier can hold.' }
      ]
    },
    {
      name: 'Prototype & Test',
      description: 'Build it, break it, learn from it.',
      activities: [
        { kind: 'deliverable', title: 'Prototype build plan', description: 'What to build, with what, and by when.' },
        { kind: 'deliverable', title: 'Test plan and results', description: 'Tests against the requirements, with recorded results.' },
        { kind: 'milestone', title: 'First working prototype', description: 'A physical unit that demonstrates the core function.' }
      ]
    },
    {
      name: 'Validate & Launch',
      description: 'Sign off the design and hand it into production.',
      activities: [
        { kind: 'approval', title: 'Final design sign-off', description: 'All requirement tests passed and open risks accepted.' },
        { kind: 'milestone', title: 'Production release', description: 'Design released to manufacturing.' },
        { kind: 'document', title: 'Launch checklist and handover notes', description: 'Everything the next team needs to run without you.' }
      ]
    }
  ]
};

const SOFTWARE: JourneyTemplate = {
  id: 'software',
  label: 'Software product development',
  description: 'Discovery through delivery and operation, with review gates at the risky points.',
  stages: [
    {
      name: 'Discovery',
      description: 'Agree what problem is being solved and what “done” means.',
      activities: [
        { kind: 'requirement', title: 'Define user stories and success criteria', description: 'Stories with acceptance criteria the team can test.' },
        { kind: 'decision', title: 'Confirm scope for the first release', description: 'What ships now versus what waits.' },
        { kind: 'deliverable', title: 'Product brief', description: 'One page: problem, audience, outcome, constraints.' }
      ]
    },
    {
      name: 'Design',
      description: 'Design the experience and the system before building it.',
      activities: [
        { kind: 'deliverable', title: 'Interface and data flow design', description: 'Key screens plus how data moves through the system.' },
        { kind: 'approval', title: 'Design review', description: 'Engineering and design agree the plan is buildable.' },
        { kind: 'risk', title: 'Log integration and security risks', description: 'Third parties, auth, data handling — anything that could derail the release.' }
      ]
    },
    {
      name: 'Build',
      description: 'Implement in slices, keeping the main branch shippable.',
      activities: [
        { kind: 'requirement', title: 'Non-functional requirements agreed', description: 'Performance, scale and reliability targets.' },
        { kind: 'deliverable', title: 'Incremental builds delivered', description: 'Working software reviewed on the branch or staging.' },
        { kind: 'milestone', title: 'Feature-complete build', description: 'Everything committed for the release; only fixes remain.' }
      ]
    },
    {
      name: 'Test & Release',
      description: 'Verify against the requirements and ship with confidence.',
      activities: [
        { kind: 'deliverable', title: 'Test results and bug triage', description: 'Regression run with known issues recorded and triaged.' },
        { kind: 'approval', title: 'Release sign-off', description: 'Product and engineering agree it is safe to ship.' },
        { kind: 'milestone', title: 'Version released', description: 'Deployed to users and announced.' }
      ]
    },
    {
      name: 'Operate & Improve',
      description: 'Watch it in production and decide what to do next.',
      activities: [
        { kind: 'document', title: 'Post-release monitoring notes', description: 'What the metrics say in the first days after release.' },
        { kind: 'decision', title: 'Prioritise next improvements', description: 'Recorded trade-offs for the next cycle.' },
        { kind: 'milestone', title: 'First customer feedback review', description: 'Real usage reviewed with the team.' }
      ]
    }
  ]
};

const RESEARCH: JourneyTemplate = {
  id: 'research',
  label: 'Research study',
  description: 'Proposal through experimentation, analysis and a reviewed report.',
  stages: [
    {
      name: 'Proposal',
      description: 'Frame the question and get agreement to study it.',
      activities: [
        { kind: 'requirement', title: 'Research question and objectives', description: 'Precisely what will be investigated and measured.' },
        { kind: 'deliverable', title: 'Study plan', description: 'Method, participants or samples, timeline, resources.' },
        { kind: 'approval', title: 'Proposal review', description: 'Supervisor or stakeholders approve the approach.' }
      ]
    },
    {
      name: 'Background',
      description: 'Know what is already known before collecting new data.',
      activities: [
        { kind: 'deliverable', title: 'Literature summary', description: 'Prior work and the gap this study addresses.' },
        { kind: 'risk', title: 'Identify methodological risks', description: 'Bias, sample size, instrument failure — planned for, not discovered later.' }
      ]
    },
    {
      name: 'Experimentation',
      description: 'Run the study and keep an honest record of what happened.',
      activities: [
        { kind: 'milestone', title: 'Experiment complete', description: 'All planned runs finished.' },
        { kind: 'deliverable', title: 'Raw data and experiment log', description: 'Unmodified data plus the conditions of each run.' }
      ]
    },
    {
      name: 'Analysis',
      description: 'Turn the data into findings you can defend.',
      activities: [
        { kind: 'deliverable', title: 'Analysis and results', description: 'Statistics or themes, with assumptions stated.' },
        { kind: 'decision', title: 'Interpret the findings', description: 'What the results mean — and what they do not show.' }
      ]
    },
    {
      name: 'Report & Review',
      description: 'Write it up, get it reviewed, deliver it.',
      activities: [
        { kind: 'document', title: 'Final report draft', description: 'Question, method, results, discussion, references.' },
        { kind: 'approval', title: 'Peer review sign-off', description: 'Reviewer comments addressed and recorded.' },
        { kind: 'milestone', title: 'Report delivered', description: 'Submitted or presented to the audience.' }
      ]
    }
  ]
};

const GENERAL: JourneyTemplate = {
  id: 'general',
  label: 'General product development',
  description: 'A flexible initiate–plan–execute–review lifecycle for any kind of project.',
  stages: [
    {
      name: 'Initiate',
      description: 'Agree why this project exists and what it must achieve.',
      activities: [
        { kind: 'requirement', title: 'Define goals and success criteria', description: 'How everyone will know this project worked.' },
        { kind: 'decision', title: 'Confirm scope', description: 'In scope, out of scope, and the assumptions being made.' },
        { kind: 'deliverable', title: 'Project brief', description: 'The short document that orients every new contributor.' }
      ]
    },
    {
      name: 'Plan',
      description: 'Decide the work, the order and the risks.',
      activities: [
        { kind: 'deliverable', title: 'Work plan and schedule', description: 'Stages, owners and dates for the major pieces.' },
        { kind: 'risk', title: 'Identify key risks', description: 'Top risks with a mitigation for each.' },
        { kind: 'approval', title: 'Plan review', description: 'Stakeholders accept the plan before execution starts.' }
      ]
    },
    {
      name: 'Execute',
      description: 'Do the work and keep the deliverables current.',
      activities: [
        { kind: 'milestone', title: 'Core work complete', description: 'The primary outcome of the project exists.' },
        { kind: 'deliverable', title: 'Main deliverables produced', description: 'The artefacts the project promised to produce.' }
      ]
    },
    {
      name: 'Review',
      description: 'Check the result against the goals.',
      activities: [
        { kind: 'approval', title: 'Stakeholder review', description: 'The people who asked for this work accept it.' },
        { kind: 'document', title: 'Status and lessons report', description: 'What happened, what was learned, what remains.' }
      ]
    },
    {
      name: 'Close',
      description: 'Wrap up cleanly so nothing is lost.',
      activities: [
        { kind: 'decision', title: 'Record final decisions', description: 'Follow-up work, owners and rationale.' },
        { kind: 'milestone', title: 'Project closure', description: 'Project formally closed.' }
      ]
    }
  ]
};

export const JOURNEY_TEMPLATES_BY_ID: Record<JourneyTemplateId, JourneyTemplate> = {
  hardware: HARDWARE,
  software: SOFTWARE,
  research: RESEARCH,
  general: GENERAL
};

/** Unknown or legacy template ids fall back to the general lifecycle. */
export function journeyTemplate(id: unknown): JourneyTemplate {
  return JOURNEY_TEMPLATES_BY_ID[(id as JourneyTemplateId) ?? 'general'] ?? GENERAL;
}

// ── Derived view ────────────────────────────────────────────────────────────

export interface JourneyWaitingOn {
  id: string;
  title: string;
  status: JourneyActivityStatus;
}

export interface JourneyArtifact {
  type: 'diagram' | 'sketch' | 'model';
  id: string;
  title: string;
  url: string;
}

export interface JourneyActivity {
  id: string;
  stageId: string;
  kind: JourneyActivityKind;
  title: string;
  description: string;
  status: JourneyActivityStatus;
  priority: IssuePriority;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  position: number;
  blockedReason: string;
  reviewState: JourneyReviewState;
  reviewedByName: string | null;
  reviewNote: string;
  completedAt: string | null;
  skipped?: boolean;
  createdAt: string;
  updatedAt: string;
  /** Incomplete activities this one depends on — none means it is ready to start. */
  waitingOn: JourneyWaitingOn[];
  /** Design Studio artefacts linked to this activity. */
  artifacts: JourneyArtifact[];
}

export interface JourneyIssue {
  id: string;
  stageId: string;
  key: string;
  summary: string;
  status: IssueStatus;
  priority: IssuePriority;
  assigneeName: string | null;
}

export interface JourneyStageView {
  id: string;
  name: string;
  description: string;
  position: number;
  state: JourneyStageState;
  percent: number;
  totalUnits: number;
  completedUnits: number;
  blockers: number;
  activities: JourneyActivity[];
  issues: JourneyIssue[];
}

export interface JourneyNextAction {
  activityId: string;
  stageId: string;
  stageName: string;
  title: string;
  kind: JourneyActivityKind;
}

export interface JourneyMilestone {
  activityId: string;
  title: string;
  dueAt: string | null;
}

export interface JourneySummary {
  percent: number;
  stagesTotal: number;
  stagesCompleted: number;
  activitiesTotal: number;
  activitiesCompleted: number;
  blockers: number;
  pendingApprovals: number;
  nextAction: JourneyNextAction | null;
  upcomingMilestones: JourneyMilestone[];
}

export interface ProjectJourneyView {
  journey: {
    id: string;
    projectId: string;
    name: string;
    template: JourneyTemplateId;
    templateLabel: string;
    description: string;
  };
  stages: JourneyStageView[];
  summary: JourneySummary;
}

export interface JourneyStageInput {
  id: string;
  name: string;
  description: string;
  position: number;
}

/**
 * Derives stage states, percentages and the journey summary from raw activity
 * and issue state. A stage is complete when every unit in it is done; the first
 * incomplete stage is the active one, or the blocked stage when it contains
 * blocked work. Everything after that is upcoming.
 */
export function deriveJourneyView(input: {
  journey: { id: string; projectId: string; name: string; template: JourneyTemplateId };
  stages: JourneyStageInput[];
  activities: JourneyActivity[];
  issues: JourneyIssue[];
}): ProjectJourneyView {
  const template = journeyTemplate(input.journey.template);
  const ordered = [...input.stages].sort((a, b) => a.position - b.position);
  let firstIncompleteSeen = false;
  let totalUnits = 0;
  let completedUnits = 0;
  let blockers = 0;
  let activitiesTotal = 0;
  let activitiesCompleted = 0;
  let pendingApprovals = 0;

  const stages: JourneyStageView[] = ordered.map((stage) => {
    const activities = input.activities
      .filter((a) => a.stageId === stage.id)
      .sort((a, b) => a.position - b.position);
    const issues = input.issues.filter((i) => i.stageId === stage.id);
    const stageBlockers = activities.filter((a) => a.status === 'blocked').length;
    const done = activities.filter((a) => a.status === 'completed').length + issues.filter((i) => i.status === 'Done').length;
    const total = activities.length + issues.length;
    const complete = total > 0 && done === total;
    let state: JourneyStageState;
    if (complete) state = 'completed';
    else if (!firstIncompleteSeen) {
      firstIncompleteSeen = true;
      state = stageBlockers > 0 ? 'blocked' : 'active';
    } else state = 'upcoming';

    totalUnits += total;
    completedUnits += done;
    blockers += stageBlockers;
    activitiesTotal += activities.length;
    activitiesCompleted += activities.filter((a) => a.status === 'completed').length;
    pendingApprovals += activities.filter((a) => a.reviewState === 'pending').length;

    return {
      id: stage.id,
      name: stage.name,
      description: stage.description,
      position: stage.position,
      state,
      percent: total === 0 ? 0 : Math.round((done / total) * 100),
      totalUnits: total,
      completedUnits: done,
      blockers: stageBlockers,
      activities,
      issues
    };
  });

  // The next concrete thing to do: first ready activity on the path. Blocked or
  // waiting work is not a next action — the summary surfaces it as a blocker.
  let nextAction: JourneyNextAction | null = null;
  for (const stage of stages) {
    for (const activity of stage.activities) {
      if (activity.status === 'completed' || activity.status === 'blocked') continue;
      if (activity.waitingOn.length > 0) continue;
      nextAction = { activityId: activity.id, stageId: stage.id, stageName: stage.name, title: activity.title, kind: activity.kind };
      break;
    }
    if (nextAction) break;
  }

  const upcomingMilestones: JourneyMilestone[] = stages
    .flatMap((stage) => stage.activities)
    .filter((a) => a.kind === 'milestone' && a.status !== 'completed')
    .sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return a.dueAt.localeCompare(b.dueAt);
    })
    .slice(0, 3)
    .map((a) => ({ activityId: a.id, title: a.title, dueAt: a.dueAt }));

  return {
    journey: {
      ...input.journey,
      templateLabel: template.label,
      description: template.description
    },
    stages,
    summary: {
      percent: totalUnits === 0 ? 0 : Math.round((completedUnits / totalUnits) * 100),
      stagesTotal: stages.length,
      stagesCompleted: stages.filter((s) => s.state === 'completed').length,
      activitiesTotal,
      activitiesCompleted,
      blockers,
      pendingApprovals,
      nextAction,
      upcomingMilestones
    }
  };
}
