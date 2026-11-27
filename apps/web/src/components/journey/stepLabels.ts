import type { JourneyActivity } from '@sv/shared';

type Tool = 'note' | 'requirement' | 'design' | 'part' | 'test' | 'change' | 'release' | 'review';
type Step = { title: string; description: string; tool: Tool; optional?: boolean };

const steps: Record<string, Step> = {};
function label(titles: string[], title: string, description: string, tool: Tool) {
  for (const original of titles) steps[original] = { title, description, tool };
}

label(['Capture the problem and target user', 'Define user stories and success criteria', 'Define goals and success criteria', 'Research question and objectives'],
  'Describe your idea', 'Write what you’re building or studying, who it’s for, and what success looks like.', 'note');
label(['Draft functional requirements', 'Confirm scope for the first release', 'Confirm scope', 'Non-functional requirements agreed', 'Specify materials and tolerances'],
  'Decide what it needs to do', 'Make a checklist of what has to work and mark each item as you go.', 'requirement');
label(['Concept sketches and architecture', 'Interface and data flow design', 'Main deliverables produced'],
  'Make your first design', 'Open Design Studio or attach a design file you already have.', 'design');
label(['Detailed CAD and drawings'], 'Refine your design', 'Update the design and save a version with the details you need to build it.', 'design');
label(['Bill of materials', 'Core work complete', 'Incremental builds delivered'],
  'List what you need to build it', 'List the parts and materials you need, with quantities and any notes.', 'part');
label(['Test plan and results', 'Test results and bug triage', 'Raw data and experiment log', 'Status and lessons report'],
  'Test your product', 'Record what you tested, what happened, and any fixes you found.', 'test');
label(['Production release', 'Version released', 'Project closure', 'Report delivered'],
  'Save this release', 'Review the versions, parts, and test results used for this release, then save a copy.', 'release');
label(['Select the preferred concept'], 'Choose a design direction', 'Record which design you chose and why.', 'change');
label(['Prioritise next improvements', 'Record final decisions'], 'Decide what to improve next', 'Record what should change and why.', 'change');
label(['Confirm project scope'], 'Choose what to build first', 'Write what you’ll build first and what can wait.', 'change');
label(['Problem statement and use cases', 'Product brief', 'Project brief'], 'Write a short project brief', 'Summarize the problem, the people it affects, and how they’ll use your product.', 'note');
label(['Log technical feasibility risks', 'Log integration and security risks'], 'Think through what could go wrong', 'Write down an issue you might run into and how you could handle it.', 'note');
steps['Log technical feasibility risks'].optional = true;
steps['Log integration and security risks'].optional = true;
label(['Prototype build plan', 'Work plan and schedule'], 'Plan the build', 'Write down the main pieces of work and the order you’ll do them in.', 'note');
label(['First working prototype', 'Feature-complete build'], 'Build a working version', 'Record what you built and what it can do so far.', 'note');
label(['Launch checklist and handover notes'], 'Prepare to hand it over', 'Write down how to use, build, or look after this release.', 'note');
label(['Post-release monitoring notes'], 'See how the release is doing', 'Record what you observe once people start using your product.', 'note');
label(['First customer feedback review'], 'Collect feedback', 'Write down what users say works and what they want improved.', 'note');
label(['Analysis and results'], 'Work out what the results show', 'Summarize what you found and record anything you’re uncertain about.', 'note');


export function stepLabel(activity: JourneyActivity): Step {
  if (activity.kind === 'approval') return {
    title: ({
      'Final design sign-off': 'Review before release',
      'Release sign-off': 'Review before release',
      'Requirements baseline review': 'Review the checklist',
      'Concept design review': 'Review the design'
    } as Record<string, string>)[activity.title] ?? activity.title,
    description: 'Ask for approval when the work is ready. Record the decision and any changes requested.',
    tool: 'review'
  };
  return steps[activity.title] ?? {
    title: activity.title,
    description: activity.description || 'Save the work and decisions for this step.',
    tool: activity.kind === 'requirement' ? 'requirement' : activity.kind === 'decision' ? 'change' : 'note'
  };
}

export const stageTitles: Record<string, string> = {
  'Discover & Define': 'Start with an idea',
  'Requirements & Feasibility': 'Plan what to build',
  'Concept Design': 'Explore designs',
  'Detailed Design': 'Get ready to build',
  'Prototype & Test': 'Build and test',
  'Validate & Launch': 'Review and release',
  'Operate & Improve': 'Learn and improve',
  Initiate: 'Start with an idea',
  Execute: 'Build the product',
  Close: 'Wrap up and release'
};
