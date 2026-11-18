import type { StageId } from './stages.js';

/** Keys, types and option values are persisted. Add keys instead of repurposing them. */
export const PRODUCT_KINDS = ['physical', 'software', 'service', 'other'] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];
export const KIND_LABELS: Record<ProductKind, string> = {
  physical: 'Physical product',
  software: 'Software',
  service: 'Service',
  other: 'Other / still exploring'
};
export type GuideMode = 'beginner' | 'advanced';
export type AnswerValue = string | number | boolean | string[] | null;
export type QuestionType =
  | 'text'
  | 'longtext'
  | 'number'
  | 'money'
  | 'choice'
  | 'multi'
  | 'scale'
  | 'yesno'
  | 'date'
  | 'evidence'
  | 'ranked'
  | 'comparison';
export const EVIDENCE_TYPES = ['Founder assumption', 'Research finding', 'Independent evidence'] as const;
export interface Question {
  key: string;
  stage: StageId;
  prompt: string;
  type: QuestionType;
  required: boolean;
  xp: number;
  /** The section in the product's living chapter brief. */
  output: string;
  help: string;
  example: string;
  advanced: string;
  placeholder?: string;
  options?: string[];
  scale?: [string, string];
  physicalOnly?: boolean;
  syncsTo?: 'targetSellingPrice' | 'description' | 'category' | 'overhead';
  retired?: boolean;
}

type Options = Partial<
  Pick<Question, 'type' | 'required' | 'xp' | 'placeholder' | 'options' | 'scale' | 'syncsTo' | 'physicalOnly'>
>;
const chapter =
  (stage: StageId) =>
  (
    key: string,
    output: string,
    prompt: string,
    help: string,
    example: string,
    advanced: string,
    options: Options = {}
  ): Question => ({
    stage,
    key,
    output,
    prompt,
    help,
    example,
    advanced,
    type: 'longtext',
    required: true,
    xp: 15,
    ...options
  });
const idea = chapter('Idea'),
  research = chapter('Research'),
  plan = chapter('Planning'),
  design = chapter('Design');
const proto = chapter('Prototype'),
  test = chapter('Testing'),
  launch = chapter('Launch'),
  improve = chapter('Improvement');
const extra = { required: false, xp: 5 };

export const QUESTION_BANK: Question[] = [
  idea(
    'idea.oneliner',
    'Product concept',
    'Describe your idea in one sentence.',
    'Imagine explaining it to a friend. Say what it does, not how it works.',
    'A booking page that helps independent tutors fill cancelled lessons.',
    'Name the user, the job and the outcome. Leave implementation choices open.',
    { type: 'text', xp: 10, syncsTo: 'description', placeholder: 'I want to build…' }
  ),
  idea(
    'idea.problem',
    'Problem statement',
    'What problem are you trying to solve?',
    'Picture a moment when someone gets stuck. What happens, and why does it matter?',
    'A tutor loses a paid hour when a student cancels too late to find a replacement.',
    'Describe the trigger, frequency and cost of the problem. Mark estimates as assumptions.'
  ),
  idea(
    'idea.customer',
    'Customer hypothesis',
    'Who runs into this problem most often?',
    'Start with one recognisable group. This is your best guess, not a proven customer base.',
    'Independent maths tutors who manage their own weekly calendar.',
    'Identify the first segment, its context of use and whether the buyer differs from the user.',
    { type: 'text', xp: 10 }
  ),
  idea(
    'idea.workaround',
    'Current alternative',
    'How do they get around it today?',
    'Look for what someone already does, even if it is just sending a message.',
    'A tutor texts each family on a waiting list until someone replies.',
    'Include switching costs and the consequences of doing nothing.',
    extra
  ),
  idea(
    'idea.promise',
    'Value proposition',
    'What would be better with your product?',
    'A value proposition is the benefit someone gets by choosing your approach.',
    'One invitation reaches the waiting list without a chain of messages.',
    'Contrast the promised benefit with the current alternative; do not claim measured gains yet.',
    extra
  ),
  idea(
    'idea.success',
    'Success hypothesis',
    'What change would tell you the idea is useful?',
    'Pick something you could observe, and name what you are still assuming.',
    'If families want short-notice slots, a tutor should be able to refill one in a day.',
    'State a falsifiable outcome, threshold and observation window.',
    extra
  ),
  idea(
    'idea.category',
    'Product category',
    'Which category does it belong to?',
    'Choose a simple label that will help your team find it.',
    'Tutor scheduling',
    'Use the vocabulary your buyer uses to compare alternatives.',
    { ...extra, type: 'text', syncsTo: 'category' }
  ),
  idea(
    'idea.excitement',
    'Founder reflection',
    'How excited are you about this idea?',
    'Record your own conviction separately from evidence that someone wants the product.',
    'Choose 2 if you are curious but still exploring alternatives.',
    'Treat this scale as a personal reflection, never a demand signal.',
    { ...extra, type: 'scale', scale: ['Just a hunch', 'Can’t stop thinking about it'] }
  ),

  research(
    'research.profile',
    'Customer profile',
    'Which group will you learn from first?',
    'Customer segmentation means grouping people by a shared need. Narrow the group until you can reach someone in it.',
    'Tutors who teach evenings and already keep a waiting list of families.',
    'Specify recruitment criteria, buying role and one segment deliberately excluded.'
  ),
  research(
    'research.competitors',
    'Competitor shortlist',
    'Which alternatives can customers choose today?',
    'Market research starts with actual choices. Compare the same job across two tools or workarounds.',
    'Compare a calendar app with a group chat on how each handles a cancellation. Note where you looked.',
    'Record source and date, price basis, strengths and trade-offs; distinguish list prices from quotes.'
  ),
  research(
    'research.comparison',
    'Side-by-side comparison',
    'How do two alternatives handle the same need?',
    'Pick a single basis for comparison. Name each alternative and record what you actually found. Say “unknown” if a capability or price is not published.',
    'Compare a calendar and a group chat on notifying a waiting list. For each, name the source you checked.',
    'Keep the job, segment, price unit and date comparable. Separate published claims from observations.',
    { type: 'comparison' }
  ),
  research(
    'research.differentiator',
    'Market gap hypothesis',
    'What need might those alternatives leave unmet?',
    'A gap is a possibility to investigate. It is not proof that people will switch.',
    'A calendar may free the slot without telling people on the waiting list.',
    'State a switching hypothesis and what observation would disprove it.',
    { xp: 10 }
  ),
  research(
    'research.interview',
    'Interview plan',
    'What will you ask a potential customer?',
    'Customer discovery means listening before pitching. Ask about the last time the problem happened.',
    '“Walk me through your last cancellation. What did you do next?” Ask two tutors this week.',
    'Plan recruitment, a non-leading question and a way to record consented, anonymised notes.'
  ),
  research(
    'research.validated',
    'Interview coverage',
    'Have you spoken to at least 5 potential customers?',
    '“Not yet” is a useful answer. A conversation count tells you about coverage, not market demand.',
    'Select Not yet if you have scheduled interviews but have not held them.',
    'Report completed conversations, not invitations. Review sign-off checks the record, not the market.',
    { type: 'yesno' }
  ),
  research(
    'research.finding',
    'Research notebook',
    'What have you learned, and how do you know?',
    'Separate a belief from something you looked up or observed. Independent evidence needs a traceable source. If you have none, record the assumption to test.',
    'Before interviews: “I think tutors want automatic reminders.” Classify this as a founder assumption.',
    'Cite a dated, independently inspectable source for external evidence. Record limitations; the platform does not verify sources.',
    { type: 'evidence' }
  ),
  research(
    'research.to_check',
    'Unvalidated assumptions',
    'Which beliefs still need to be checked?',
    'Keep an explicit list of what you do not know. Put the riskiest assumption first.',
    'Families can accept at short notice → tutors have permission to message the list.',
    'Rank by consequence and uncertainty. Link each assumption to a planned observation.',
    { ...extra, type: 'ranked' }
  ),
  research(
    'research.market_price',
    'Market price observation',
    'What do similar products usually sell for?',
    'Record a price you actually found. Use the same currency and unit as your cost sheet.',
    'For a subscription, compare the price of one month, not a discounted year.',
    'Normalise competitor prices to a common billing period, quantity and currency.',
    { type: 'money', required: false, xp: 10 }
  ),
  research(
    'research.channels',
    'Channel shortlist',
    'Where might customers buy it?',
    'Pick places this audience already uses. These are possible channels to test.',
    'A tutor might subscribe directly on your website.',
    'Prioritise channels by reach, acquisition cost and evidence of buyer intent.',
    {
      ...extra,
      type: 'multi',
      options: [
        'Own website',
        'Marketplaces',
        'Retail stores',
        'Wholesale / B2B',
        'Social commerce',
        'Pop-ups & events'
      ]
    }
  ),

  plan(
    'planning.mvp',
    'MVP definition',
    'What is the smallest useful version you could try?',
    'A minimum viable product (MVP) does one useful job so you can test whether people want it. You can do part of the work by hand.',
    'Let one tutor publish one open slot. Manually confirm the first family who replies; leave payments for later.',
    'Define the core job, testable hypothesis, scope boundary and explicit non-goals.'
  ),
  plan(
    'planning.priorities',
    'Prioritised feature list',
    'Put the essential features in build order.',
    'Start with what a user absolutely needs. Move nice-to-haves out of the first version.',
    'Publish an open slot → claim the slot → send confirmation. Leave analytics out.',
    'Order the critical path by dependencies and learning value. Record deferred scope in your MVP definition.',
    { type: 'ranked' }
  ),
  plan(
    'planning.roadmap',
    'Roadmap & responsibilities',
    'Who will do the next pieces of work, and when?',
    'A roadmap is a rough order of milestones. Names and dates make it actionable, even if every name is yours.',
    'Week one: I sketch booking. Week two: Jo builds confirmation. Week three: we run a pilot.',
    'Identify owners, capacity, required tools and dependencies. Turn the next milestone into a product task.'
  ),
  plan(
    'planning.risk',
    'Risk register',
    'What could stop this plan, and what would you do?',
    'Name one uncertainty, a warning sign and a backup plan.',
    'If tutors cannot recruit families by Friday, invite a second tutor to the pilot.',
    'Record likelihood, impact, mitigation owner and review trigger.'
  ),
  plan(
    'planning.budget',
    'Initial budget',
    'How much can you spend getting to launch?',
    'Estimate the whole first build, not the cost of serving one person. Include your time, tools and a little room for surprises.',
    'Two days of paid help plus three months of hosting form a starting budget.',
    'Record a base estimate in workspace currency; document exclusions and contingency on the roadmap.',
    { type: 'money', xp: 5 }
  ),
  plan(
    'planning.target_price',
    'Target selling price',
    'What price will you test for one sale?',
    'A sale can be one object, a month of software or a service visit. This estimate updates your actual cost sheet.',
    'For a tutor subscription, price one month of access.',
    'Set the unit of sale and a revenue hypothesis, not a claim about willingness to pay.',
    { type: 'money', syncsTo: 'targetSellingPrice' }
  ),
  plan(
    'planning.target_margin',
    'Target margin',
    'What share of each sale would you like to keep (%)?',
    'Gross margin is what is left after the cost of delivering the sale, as a percentage of its price.',
    'A price of 100 and delivery cost of 65 leave a margin of 35%.',
    'Target margin = (selling price − unit cost) ÷ selling price × 100.',
    { type: 'number', required: false, xp: 10 }
  ),
  plan(
    'planning.first_batch',
    'First batch estimate',
    'How many units will your first batch be?',
    'Choose a pilot quantity small enough to change after testing.',
    'Make ten pieces before ordering a hundred.',
    'Check minimum order quantities and working capital exposure.',
    { ...extra, type: 'number', physicalOnly: true, xp: 10 }
  ),
  plan(
    'planning.launch_date',
    'Target launch date',
    'When would you like to launch?',
    'An initial date helps you work backwards. It is not a promise to customers.',
    'Pick the Monday after a planned two-week pilot.',
    'Record a target window and check its critical-path dependencies.',
    { ...extra, type: 'date', xp: 10 }
  ),

  design(
    'design.journey',
    'User journey',
    'Walk through one person’s path from start to finish.',
    'A user journey is the sequence of things someone does to get a result. Start before they touch the product.',
    'A parent gets a message, opens the slot, checks the time and confirms.',
    'Include the actor, trigger, touchpoints, outcome and recovery path.'
  ),
  design(
    'design.must_haves',
    'Design brief',
    'What does the first design need to do?',
    'Describe up to three things the person must be able to do. A component is one part that helps them do it.',
    'A slot card shows the time, a claim button reserves it and a receipt confirms it.',
    'Map functional requirements to components and the corresponding MVP scope.'
  ),
  design(
    'design.behaviour',
    'Feature specification',
    'How should one feature behave when used?',
    'A specification says what should happen, not just what something looks like. Include what happens if it goes wrong.',
    'When two families claim one slot, only the first gets it; the other sees that it has gone.',
    'Document preconditions, input, state transition, exception and acceptance check.'
  ),
  design(
    'design.decision',
    'Design decision log',
    'Which design choice did you make, and why?',
    'A wireframe is a rough layout. You can sketch one on paper before choosing between layouts.',
    'Use a list rather than a calendar because parents only need the next open time.',
    'Record alternatives, trade-off, decision owner and the condition for revisiting it.'
  ),
  design(
    'design.materials_chosen',
    'Material selection',
    'Have you chosen the main materials?',
    'Use Materials to record actual quantities and supplier quotes when you have them.',
    'For a bottle, record the body and lid separately so the costs stay visible.',
    'Reference the chosen grade, availability and supplier quote in the bill of materials.',
    { ...extra, xp: 10, physicalOnly: true, type: 'yesno' }
  ),
  design(
    'design.dimensions',
    'Design dimensions',
    'What are the key dimensions and weight?',
    'Use units and identify estimates so a prototype can be compared with the design.',
    'A lid must fit a 70 mm opening; weigh the first sample.',
    'Specify tolerances, measurement method and revision.',
    { ...extra, type: 'text', physicalOnly: true }
  ),
  design(
    'design.sustainability',
    'Sustainability reflection',
    'How much has sustainability shaped the design?',
    'Consider waste, energy or the cost of maintaining the product over time.',
    'Choose the high end if repairability has guided a specific design choice.',
    'Record the lifecycle trade-off behind this self-assessment.',
    { ...extra, type: 'scale', scale: ['Not considered yet', 'Core to the product'] }
  ),

  proto(
    'prototype.objective',
    'Prototype plan',
    'What should this first version help you find out?',
    'A prototype is a rough version built to learn one thing. It need not be ready to sell.',
    'Try a clickable booking screen to see whether a parent can find the right time.',
    'Identify the riskiest unknown, prototype fidelity and exit criterion.'
  ),
  proto(
    'prototype.resources',
    'Resource inventory',
    'Which tools, people or supplies will you need?',
    'List what the next build depends on. For a physical product, keep quantities in Materials and quotes in Suppliers.',
    'For software: a calendar API, a test account and a tutor for a walkthrough.',
    'Record versions, access, owner and lead time. Put unresolved dependencies into Tasks.'
  ),
  proto(
    'prototype.overhead',
    'Unit cost estimate',
    'How much shared cost belongs to one sale?',
    'Divide recurring tool or facility costs by expected sales for the same period. This updates Overhead in the cost sheet; enter zero if there is genuinely no shared cost.',
    'Hosting of 200 per month across 40 subscriptions adds 5 per sale.',
    'Use a documented allocation basis. Do not double-count labour, packaging or BOM costs.',
    { type: 'money', syncsTo: 'overhead' }
  ),
  proto(
    'prototype.version',
    'Build status',
    'Which prototype version are you on?',
    'Choose the closest fit. A sketch explores the idea; a working version lets someone try the core job.',
    'A paper service walkthrough is a sketch; a working booking flow is a works-like prototype.',
    'Distinguish appearance prototypes from functional builds and pre-production samples.',
    {
      type: 'choice',
      options: ['Sketch / mock-up', 'v1 looks-like', 'v1 works-like', 'v2+', 'Pre-production sample'],
      xp: 10
    }
  ),
  proto(
    'prototype.learnings',
    'Prototype change log',
    'What changed in the build, or what is blocking it?',
    'Describe the last attempt and what you will try next. Record a blocker honestly if you have not built it yet.',
    'The first screen hid the time zone. Move it beside the slot time on the next revision.',
    'Link the build revision, observed limitation and proposed change to a development task.'
  ),
  proto(
    'prototype.cost_confidence',
    'Cost confidence',
    'How reliable is your cost estimate?',
    'Distinguish a guess from supplier quotes, invoices or measured usage.',
    'Use the low end when you have a hosting list price but no usage data yet.',
    'Record the evidence basis, volume assumptions and largest uncertainty.',
    { ...extra, xp: 10, type: 'scale', scale: ['Rough guess', 'Measured or quoted'] }
  ),

  test(
    'testing.criteria',
    'Test plan',
    'What must work before someone can use this?',
    'Acceptance criteria describe what passing looks like. Functional testing checks behaviour; usability testing checks whether people can use it.',
    'A parent must be able to claim one slot without assistance and receive exactly one confirmation.',
    'Define preconditions, action, observable expected result and a pass/fail threshold.'
  ),
  test(
    'testing.scenario',
    'Test scenario',
    'Give a tester one realistic task to try.',
    'Tell them the goal rather than the clicks. Pick someone similar to your target user.',
    'Ask a parent to book next Tuesday’s free slot. Watch without coaching.',
    'Specify tester segment, environment, test data and observation method.'
  ),
  test(
    'testing.results',
    'Test results & feedback',
    'What actually happened compared with the expected result?',
    'Quality assurance means checking the product systematically. Record the build and the observation. If untested, say so; do not guess what users said.',
    'Record the test date, expected confirmation, actual message and whether someone needed help.',
    'Separate observed behaviour, verbatim feedback and interpretation. Log unrun tests as not run.'
  ),
  test(
    'testing.issues',
    'Prioritised issue list',
    'Which problem should be fixed first?',
    'Put failures that prevent the main job above annoyances. Use Tasks to track the fix.',
    'A duplicate booking comes before a confusing button colour.',
    'Rank by severity, frequency and user impact; specify how to retest.',
    { type: 'ranked', required: false }
  ),
  test(
    'testing.testers',
    'Tester count',
    'How many people have tested it?',
    'Count distinct testers who actually tried this version. Zero is a valid result.',
    'Three sessions with the same person count as one tester.',
    'Record unique participants and note representativeness separately.',
    { type: 'number', xp: 10 }
  ),
  test(
    'testing.satisfaction',
    'Tester satisfaction',
    'How happy were testers overall?',
    'Only answer if you collected ratings. Skipping this is better than inventing feedback.',
    'Use the middle rating for mixed responses and describe the spread in your results.',
    'State sample size and scale; avoid generalising to the whole market.',
    { ...extra, xp: 10, type: 'scale', scale: ['Unhappy', 'Delighted'] }
  ),
  test(
    'testing.certifications',
    'Compliance questions',
    'Which certifications need investigation?',
    'This is a planning note, not a compliance assessment or certificate.',
    'Ask a qualified specialist which requirements apply in the intended market.',
    'Confirm applicability, jurisdiction and evidence with the responsible assessor.',
    {
      ...extra,
      physicalOnly: true,
      type: 'multi',
      options: ['None', 'CE', 'FCC', 'UL', 'RoHS', 'FDA / food-safe', 'BIS', 'Other']
    }
  ),

  launch(
    'launch.date',
    'Launch date',
    'When will the product be available?',
    'A release date gives everyone a shared point to plan around. You can revise it.',
    'Start with a small pilot release before announcing it more widely.',
    'Distinguish pilot, general availability and rollback windows.',
    { type: 'date', xp: 10 }
  ),
  launch(
    'launch.price',
    'Launch pricing',
    'What will you charge for one sale at launch?',
    'Review your cost sheet. The price must make sense both to buyers and to you. A free pilot can cost zero.',
    'Compare the price of a month of access with the cost of delivering one month.',
    'Document the billing unit, discounts and expected gross margin. This sets the actual selling price.',
    { type: 'money', syncsTo: 'targetSellingPrice' }
  ),
  launch(
    'launch.plan',
    'Go-to-market outline',
    'How will your first customers hear about it?',
    'A go-to-market plan names an audience, a place to reach them and a clear invitation.',
    'Show the booking flow in a tutor association newsletter and invite readers to try one slot.',
    'Specify channel, message, asset, owner and conversion event.'
  ),
  launch(
    'launch.metric',
    'Launch objective',
    'What signal will you watch in the first week?',
    'Pick a measure that tells you whether people used the product, not just whether they saw it.',
    'Count tutors who publish a slot and families who successfully claim it.',
    'Define numerator, denominator, observation period and decision threshold.'
  ),
  launch(
    'launch.readiness',
    'Release checklist',
    'Which release checks have you actually finished?',
    'Check only work you have done. An unfinished checklist is a decision aid, not permission to release.',
    'If support is ready but there is no rollback plan, check only the support item.',
    'Review open checks and owners before making a go/no-go decision.',
    {
      type: 'multi',
      options: [
        'Core flow tested',
        'Pricing reviewed',
        'Launch message ready',
        'Support contact ready',
        'Fallback plan ready',
        'None finished yet'
      ]
    }
  ),
  launch(
    'launch.first_month_units',
    'Sales forecast',
    'How many sales do you expect in month one?',
    'Make a forecast you can compare with actual sales later. It is not revenue evidence.',
    'If ten invited tutors each try one month, that is ten subscriptions.',
    'State the acquisition and conversion assumptions behind the forecast.',
    { ...extra, type: 'number', xp: 10 }
  ),

  improve(
    'improve.feedback',
    'Feedback log',
    'What feedback have you actually received?',
    'Keep the source and the difference between what someone said and what you inferred. If no feedback has arrived, name the gap.',
    'Record an anonymised support message with its date, not a made-up testimonial.',
    'Tag source, segment, frequency and verbatim versus inferred need.'
  ),
  improve(
    'improve.performance',
    'Performance observations',
    'How did one result compare with your launch goal?',
    'Compare the same measure over the same period. Spell out missing data rather than filling it in.',
    'Compare completed bookings this week with the target in the launch plan.',
    'Include the baseline, period, denominator and limitations of the comparison.'
  ),
  improve(
    'improve.units_sold',
    'Sales observation',
    'How many sales have you recorded so far?',
    'Use your sales record, not your original forecast. A service booking or subscription can count as a sale.',
    'Count paid bookings for the period you described in your performance notes.',
    'Reconcile the reporting period, refunds and definition of a sale.',
    { type: 'number', xp: 10 }
  ),
  improve(
    'improve.backlog',
    'Improvement backlog',
    'Put the next changes in priority order.',
    'Look for recurring problems. Choose changes that remove a real obstacle before polishing the surface.',
    'Prevent duplicate claims → clarify the time zone → add more calendar colours.',
    'Rank using impact, confidence, effort and dependencies. Consult Improve it for data-backed suggestions.',
    { type: 'ranked' }
  ),
  improve(
    'improve.next',
    'Next iteration brief',
    'What will you change in the next version?',
    'An iteration is another build-and-learn cycle. Pick one change and how you will tell whether it helped.',
    'Try a clearer time label and repeat the booking test with new participants.',
    'State the intervention, success metric and next experiment.'
  ),
  improve(
    'improve.return',
    'Next development cycle',
    'Where should the next cycle start?',
    'Return to research for an unknown need, planning for a scope change, or design for a different experience. Your earlier work stays in place.',
    'If people struggle to spot the time zone, revisit Design and revise the feature specification.',
    'Choose the earliest affected chapter; revisit dependent specifications and tests.',
    { type: 'choice', options: ['Research', 'Planning', 'Design', 'Prototype', 'Testing'], xp: 10 }
  ),
  chapter('Retired')(
    'retired.reason',
    'Archive note',
    'Why is this product being retired?',
    'Keep the reason so you can learn from this product later.',
    'A replacement version now meets the same need.',
    'Record the sunset decision and where customers should go next.',
    { required: false, xp: 10 }
  )
];

export const QUESTIONS_BY_KEY = new Map(QUESTION_BANK.map((q) => [q.key, q]));
export function questionsForStage(stage: StageId, kind?: ProductKind): Question[] {
  return QUESTION_BANK.filter(
    (q) => q.stage === stage && !q.retired && (!q.physicalOnly || !kind || kind === 'physical')
  );
}
export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return typeof value !== 'number' || Number.isFinite(value);
}

/** A draft may be incomplete. Only normalised, deliberately submitted values enter answers. */
export function normaliseAnswer(q: Question, raw: unknown): { value: AnswerValue } | { error: string } {
  if (raw == null || raw === '') return { value: null };
  switch (q.type) {
    case 'text':
    case 'longtext': {
      if (typeof raw !== 'string') return { error: 'Expected text' };
      const max = q.type === 'text' ? 300 : 5000;
      if (raw.length > max) return { error: `Keep it under ${max} characters` };
      return { value: raw.trim() || null };
    }
    case 'number':
    case 'money':
    case 'scale': {
      if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) return { error: 'Expected a number' };
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 1e12) return { error: 'Enter a finite, non-negative number' };
      if (q.type === 'scale' && (!Number.isInteger(n) || n < 1 || n > 5)) return { error: 'Pick a value from 1 to 5' };
      if (q.key === 'planning.target_margin' && n > 100) return { error: 'A percentage cannot exceed 100' };
      if (q.type === 'number' && q.key !== 'planning.target_margin' && !Number.isInteger(n))
        return { error: 'Use a whole number' };
      return { value: Math.round(n * 100) / 100 };
    }
    case 'yesno':
      return typeof raw === 'boolean' ? { value: raw } : { error: 'Choose yes or not yet' };
    case 'date': {
      if (
        typeof raw !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(raw) ||
        !Number.isFinite(Date.parse(raw)) ||
        new Date(raw).toISOString().slice(0, 10) !== raw
      )
        return { error: 'Enter a real calendar date' };
      return { value: raw };
    }
    case 'choice':
      return typeof raw === 'string' && q.options?.includes(raw)
        ? { value: raw }
        : { error: 'Pick one of the options' };
    case 'multi': {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !q.options?.includes(v)))
        return { error: 'Pick from the options' };
      if (raw.includes('None finished yet') && raw.length > 1)
        return { error: 'Select finished checks or “None finished yet”, not both' };
      return { value: [...new Set(raw as string[])] };
    }
    case 'comparison': {
      if (
        !Array.isArray(raw) ||
        raw.length !== 3 ||
        raw.some((v) => typeof v !== 'string' || !v.trim() || v.length > 1000)
      )
        return { error: 'Add one criterion and both alternatives (up to 1,000 characters each)' };
      return { value: raw.map((v) => v.trim()) };
    }
    case 'ranked': {
      if (
        !Array.isArray(raw) ||
        !raw.length ||
        raw.length > 12 ||
        raw.some((x) => typeof x !== 'string' || !x.trim() || x.length > 200)
      )
        return { error: 'Give each item a name (up to 12 items, 200 characters each)' };
      const values = raw.map((x) => x.trim());
      return new Set(values).size === values.length ? { value: values } : { error: 'List each item only once' };
    }
    case 'evidence': {
      if (!Array.isArray(raw) || raw.length !== 3 || raw.some((x) => typeof x !== 'string' || x.length > 2000))
        return { error: 'Include a classification, observation and source field' };
      const [basis, note, source] = raw.map((x) => x.trim());
      if (!EVIDENCE_TYPES.some((t) => t === basis) || !note)
        return { error: 'Choose a classification and describe your observation' };
      if (basis !== EVIDENCE_TYPES[0] && !source)
        return { error: 'Add a traceable source, or label this a founder assumption' };
      return { value: [basis, note, source] };
    }
  }
}
