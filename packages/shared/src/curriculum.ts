/**
 * The Duolingo-style PDLC curriculum.
 *
 * WORLD → UNIT → LESSON → CHECKPOINT → WORLD COMPLETION → NEXT WORLD.
 *
 * This file is the *content* of the journey: what each world teaches, which
 * units it contains, what each lesson asks the founder to do, and what its
 * checkpoint evaluates. It declares no completion state and no progress — that
 * is derived per product from real records (`progress.ts`), so a lesson can
 * never be marked done because this file says so.
 *
 * Every lesson's activity writes to a real Solution Velocity record. `binds`
 * names that record so the progress engine knows where to look:
 *
 *   answer     → products.answers[key]        (sales/discovery questions)
 *   field      → a column on products          (name, description, notes, price, category)
 *   costs      → products.labour/packaging/overhead
 *   material   → product_materials              (bill of materials)
 *   task       → tasks                          (checklist work)
 *   research   → research_entries               (documented research + evidence)
 *   requirement→ requirements                   (product requirements)
 *   test       → test_results                   (testing records)
 *   decision   → decisions                      (recorded product decisions)
 *   feedback   → feedback_items                 (customer feedback + improvement backlog)
 */

import type { StageId } from './stages.js';

// ── Activity types a lesson can contain ────────────────────────────────────

export const ACTIVITY_KINDS = [
  /** Pick one of several explanations. Teaches a concept before asking for work. */
  'choice',
  /** Free text, validated for substance rather than length alone. */
  'write',
  /** A set of evidence items the founder ticks off as they complete real work. */
  'checklist',
  /** A structured set of numeric/text inputs, e.g. a cost sheet or test matrix. */
  'form',
  /** A ranked or scored list, e.g. feature prioritisation. */
  'priority'
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** Where a lesson's work is stored. Drives both validation and the map's data binding. */
export const BIND_TARGETS = [
  'answer',
  'field',
  'costs',
  'material',
  'task',
  'research',
  'requirement',
  'test',
  'decision',
  'feedback'
] as const;
export type BindTarget = (typeof BIND_TARGETS)[number];

export interface LessonBind {
  target: BindTarget;
  /**
   * Which record. For `answer` this is the question key; for `field` the column
   * name; for the table-backed targets it is the kind/type stored on the row.
   */
  key: string;
  /** Only count rows created/updated for this product at or after this stage. */
  stage?: StageId;
}

export interface ChoiceOption {
  id: string;
  label: string;
  /** Plain-English feedback shown when picked. */
  feedback: string;
  correct: boolean;
}

export interface ChecklistItem {
  id: string;
  label: string;
  /** What "done" looks like, so the tick is honest. */
  doneWhen: string;
}

export interface FormField {
  id: string;
  label: string;
  type: 'text' | 'longtext' | 'number' | 'money';
  placeholder?: string;
  help?: string;
  required: boolean;
}

export interface PriorityItem {
  id: string;
  label: string;
  help?: string;
}

/** One lesson. Every field here is content, never state. */
export interface Lesson {
  /** Stable id: `w1.u1.l1`. Never rename — progress and XP refs are stored against it. */
  id: string;
  title: string;
  /** One plain-English sentence: what this lesson is for. */
  summary: string;
  /** The concept, explained before any work is asked for. */
  concept: string;
  /** A concrete worked example the founder can compare against. */
  example: string;
  /** Extra explanation revealed on demand ("Contextual assistance"). */
  help: string;
  activity: {
    kind: ActivityKind;
    /** What the founder must produce. */
    prompt: string;
    /** Shown on the empty state to remove blank-page paralysis. */
    placeholder?: string;
    /** `choice` only. */
    options?: ChoiceOption[];
    /** `checklist` only. */
    items?: ChecklistItem[];
    /** `form` only. */
    fields?: FormField[];
    /** `priority` only. */
    priorities?: PriorityItem[];
    /** Minimum characters for `write`; ignored otherwise. */
    minLength?: number;
  };
  /** Where the result is stored. Every lesson must write something real. */
  bind: LessonBind;
  /** XP for the first completion. Re-completion never pays again. */
  xp: number;
}

export interface Unit {
  id: string;
  title: string;
  /** Why this unit matters, one sentence. */
  blurb: string;
  lessons: Lesson[];
}

export interface CheckpointCriterion {
  id: string;
  label: string;
  /** The record that must exist for this criterion to pass. */
  bind: LessonBind;
  /** Minimum number of matching records (defaults to 1). */
  min?: number;
}

export interface Checkpoint {
  id: string;
  title: string;
  /** The deliverable being reviewed, in plain English. */
  deliverable: string;
  /** What "ready" means. Shown before the founder submits. */
  readyWhen: string;
  criteria: CheckpointCriterion[];
  /** XP for passing. */
  xp: number;
}

export interface World {
  id: string;
  /** 1-based world number, for "World 2 of 8". */
  index: number;
  /** The lifecycle stage this world advances. */
  stage: StageId;
  title: string;
  /** One-line promise of the world. */
  blurb: string;
  /** What the founder can do once the world is complete. */
  outcome: string;
  units: Unit[];
  checkpoint: Checkpoint;
}

// ── The eight worlds ───────────────────────────────────────────────────────

export const WORLDS: World[] = [
  // ══════════════════════════════ WORLD 1 — IDEA ══════════════════════════════
  {
    id: 'w1',
    index: 1,
    stage: 'Idea',
    title: 'Idea',
    blurb: 'Understand and define the product.',
    outcome: 'A defined problem, a specific customer and a one-line product concept.',
    units: [
      {
        id: 'w1.u1',
        title: 'Discover your idea',
        blurb: 'Turn a vague notion into a problem worth solving.',
        lessons: [
          {
            id: 'w1.u1.l1',
            title: 'Introduce your idea',
            summary: 'Name what you are building and why it exists.',
            concept:
              'A product is a response to a problem. Before features, materials or prices, you need one sentence that says what it is. This sentence becomes the first thing anyone reads about your product, and it is what you will test every later decision against.',
            example:
              'Weak: “A smart device for gardeners.”\nStrong: “A battery-powered plant monitor that tells apartment gardeners when to water, so houseplants stop dying from guesswork.”',
            help: 'The strong version names who it is for (apartment gardeners), what it does (tells them when to water) and what it replaces (guesswork). Yours does not need to be perfect — you can edit it later.',
            activity: {
              kind: 'write',
              prompt: 'Describe your product in one sentence. Say who it is for and what it does.',
              placeholder: 'A battery-powered plant monitor that tells apartment gardeners when to water…',
              minLength: 25
            },
            bind: { target: 'field', key: 'description' },
            xp: 15
          },
          {
            id: 'w1.u1.l2',
            title: 'Identify the problem',
            summary: 'Say what goes wrong today, in your customer’s words.',
            concept:
              'The problem is not the absence of your product. It is the thing that already costs your customer time, money or frustration. Writing it from their point of view keeps you honest: if the problem is vague, the product will be too.',
            example:
              '“People buy single-use plastic bottles because reusable ones are heavy, ugly or leak in their bag.” That names a real cost (buying bottles repeatedly), a real objection (heavy, ugly, leaky) and no solution.',
            help: 'Avoid starting with “People need an app that…”. Describe the situation your customer is in right now, before your product exists.',
            activity: {
              kind: 'write',
              prompt: 'What problem does your customer have today? Write it in their words.',
              placeholder: 'People buy single-use plastic bottles because reusable ones are heavy, ugly or leak…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'idea.problem' },
            xp: 15
          },
          {
            id: 'w1.u1.l3',
            title: 'Explain why it matters',
            summary: 'Decide how strongly the problem is worth solving.',
            concept:
              'Not every problem deserves a product. Rate how much it hurts: how often it happens, what it costs, and whether people already pay to solve it another way. A high rating means you can charge for the fix.',
            example:
              'A leaky bottle costs someone a laptop (high). A slightly dull bottle lid costs them nothing (low). The first justifies a premium product; the second does not.',
            help: 'A 1–5 rating is stored on your product and shown in your journey. You can change it later if your research changes your mind.',
            activity: {
              kind: 'choice',
              prompt: 'How painful is this problem for your customer today?',
              options: [
                {
                  id: 'acute',
                  label: 'Acute — it costs them money or time regularly and they complain about it',
                  feedback: 'Good. An acute problem is the easiest to charge for, and your research will confirm the cost.',
                  correct: true
                },
                {
                  id: 'annoying',
                  label: 'Annoying — they notice it but live with it',
                  feedback: 'Workable, but you will need to make the improvement obvious. Your research should test whether they would pay.',
                  correct: true
                },
                {
                  id: 'minor',
                  label: 'Minor — barely noticed',
                  feedback: 'Be careful. A problem nobody notices is hard to sell. Consider whether a different problem sits behind it.',
                  correct: true
                }
              ]
            },
            bind: { target: 'answer', key: 'idea.excitement' },
            xp: 10
          }
        ]
      },
      {
        id: 'w1.u2',
        title: 'Find your audience',
        blurb: 'Get specific about who buys, and why they would choose you.',
        lessons: [
          {
            id: 'w1.u2.l1',
            title: 'Identify your customers',
            summary: 'Describe the people who will actually pay.',
            concept:
              '“Everyone” is not a customer. A usable customer description names a situation: where they are, what they already do about the problem, and what they would give up to fix it. Specific customers make every later decision easier — price, features, and where to find them.',
            example:
              '“Commuters and gym-goers aged 20–40 who care about design and sustainability” tells you where to advertise, what to emphasise (design, sustainability) and what they compare you against.',
            help: 'If you cannot name one specific group, pick your best guess and write it down. Research in World 2 exists to test that guess.',
            activity: {
              kind: 'write',
              prompt: 'Who is your customer? Describe the specific group, not “everyone”.',
              placeholder: 'Commuters and gym-goers aged 20–40 who care about design and sustainability…',
              minLength: 15
            },
            bind: { target: 'answer', key: 'idea.customer' },
            xp: 10
          },
          {
            id: 'w1.u2.l2',
            title: 'Understand their needs',
            summary: 'Separate what they need from what you want to build.',
            concept:
              'Customers buy outcomes, not features. A person does not want a 500ml stainless steel vessel; they want to stop buying plastic bottles and stop worrying about leaks. Listing needs as outcomes keeps you from building features nobody asked for.',
            example:
              'Feature: “double-walled vacuum insulation.”\nNeed it serves: “my drink is still cold at the end of a long commute.”',
            help: 'Write needs as sentences starting with “I need to…”. If you find yourself writing “they need a button that…”, you have slipped back into features.',
            activity: {
              kind: 'write',
              prompt: 'What does your customer need to achieve? List two or three outcomes.',
              placeholder: 'I need my drink to still be cold at the end of my commute. I need a bottle that does not leak in my bag…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'idea.customer_needs' },
            xp: 10
          },
          {
            id: 'w1.u2.l3',
            title: 'Define your value proposition',
            summary: 'Say why they would pick you over the alternative.',
            concept:
              'Your value proposition is the one trade-off you win. Everyone has an alternative today, even if it is “put up with it”. State what you do better, for whom, and why that matters enough to switch.',
            example:
              '“For commuters who care how their kit looks, this is the only insulated bottle that survives a bag, a gym locker and a dishwasher without leaking or denting.”',
            help: 'A strong value proposition is specific enough that someone could disagree with it. “High quality and great design” is not specific.',
            activity: {
              kind: 'write',
              prompt: 'Complete this: “For [who], this is the only [what] that [why it matters].”',
              placeholder: 'For commuters who care how their kit looks, this is the only insulated bottle that…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'idea.value_proposition' },
            xp: 15
          }
        ]
      },
      {
        id: 'w1.u3',
        title: 'Establish your product',
        blurb: 'Surface your risky assumptions and define the concept.',
        lessons: [
          {
            id: 'w1.u3.l1',
            title: 'Identify your assumptions',
            summary: 'Write down what you believe but have not checked.',
            concept:
              'Every product rests on beliefs: that the problem is real, that people will pay, that you can build it, that you can make it profitably. Written down, these become testable. Unwritten, they become expensive surprises in World 5.',
            example:
              '“I assume commuters will pay $40 for a bottle” is testable in research. “People want good products” is not — it is too vague to check.',
            help: 'Aim for beliefs you could be wrong about. The most dangerous assumptions are the ones you have never questioned.',
            activity: {
              kind: 'write',
              prompt: 'List the three beliefs your product depends on that you have not yet tested.',
              placeholder: '1. Commuters will pay $40 for a bottle. 2. A vacuum wall fits in a bag-sized profile. 3. I can source food-grade steel at my price…',
              minLength: 30
            },
            bind: { target: 'answer', key: 'idea.assumptions' },
            xp: 15
          },
          {
            id: 'w1.u3.l2',
            title: 'Define the product concept',
            summary: 'Describe the product itself, concretely.',
            concept:
              'The concept is what the thing is and what it is not. Naming the category, the core mechanism and the deliberate exclusions forces the decisions that a feature list hides.',
            example:
              '“A 500ml double-walled bottle, dishwasher safe, with a leak-proof lid. It is not a thermos, not smart, and does not track intake.”',
            help: 'The exclusions matter most. Writing “not this” prevents scope creep later in Planning.',
            activity: {
              kind: 'write',
              prompt: 'Describe your product concept: what it is, and what it deliberately is not.',
              placeholder: 'A 500ml double-walled bottle, dishwasher safe, with a leak-proof lid. It is not…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'idea.concept' },
            xp: 15
          },
          {
            id: 'w1.u3.l3',
            title: 'Prepare the product foundation',
            summary: 'Set the category your product belongs to.',
            concept:
              'A category groups your product with the things it competes against and shapes how it is costed, sourced and compared. Choosing it now means your materials and competitors are filed in the right place.',
            example:
              'A bottle belongs with “Other” or a drinkware category. Putting it under “Electronics” would file the wrong suppliers against it and distort your cost comparisons.',
            help: 'You can change the category later; this just sets the starting point for your materials and cost view.',
            activity: {
              kind: 'choice',
              prompt: 'Which category best fits your product?',
              options: [
                { id: 'plastics', label: 'Plastics & Acrylics', feedback: 'Recorded. Your materials list will be grouped here.', correct: true },
                { id: 'metals', label: 'Metals & Alloys', feedback: 'Recorded. Your materials list will be grouped here.', correct: true },
                { id: 'electronics', label: 'Electronics', feedback: 'Recorded. Your materials list will be grouped here.', correct: true },
                { id: 'wood', label: 'Wood & Timber', feedback: 'Recorded. Your materials list will be grouped here.', correct: true },
                { id: 'packaging', label: 'Packaging', feedback: 'Recorded. Your materials list will be grouped here.', correct: true },
                { id: 'textiles', label: 'Textiles & Leather', feedback: 'Recorded. Your materials list will be grouped here.', correct: true },
                { id: 'other', label: 'Other', feedback: 'Recorded. Your materials list will be grouped here.', correct: true }
              ]
            },
            bind: { target: 'field', key: 'category' },
            xp: 10
          }
        ]
      }
    ],
    checkpoint: {
      id: 'w1.checkpoint',
      title: 'Product concept review',
      deliverable: 'A submitted product concept with a named problem, customer and value proposition.',
      readyWhen:
        'Your product has a one-line description, a recorded problem, a specific customer, a value proposition and a category. The checkpoint checks these records exist and are substantive — not that you typed something short.',
      criteria: [
        { id: 'description', label: 'The product has a one-line description', bind: { target: 'field', key: 'description' } },
        { id: 'problem', label: 'The customer problem is recorded', bind: { target: 'answer', key: 'idea.problem' } },
        { id: 'customer', label: 'A specific customer group is recorded', bind: { target: 'answer', key: 'idea.customer' } },
        { id: 'value', label: 'A value proposition is recorded', bind: { target: 'answer', key: 'idea.value_proposition' } },
        { id: 'category', label: 'The product has a category', bind: { target: 'field', key: 'category' } }
      ],
      xp: 50
    }
  },

  // ════════════════════════════ WORLD 2 — RESEARCH ════════════════════════════
  {
    id: 'w2',
    index: 2,
    stage: 'Research',
    title: 'Research',
    blurb: 'Understand customers, competitors and the market.',
    outcome: 'Documented evidence about who buys, what they compare you against and what it should cost.',
    units: [
      {
        id: 'w2.u1',
        title: 'Customer discovery',
        blurb: 'Find out what customers actually do, not what they say they would do.',
        lessons: [
          {
            id: 'w2.u1.l1',
            title: 'Identify customer groups',
            summary: 'Split your audience into groups you can research separately.',
            concept:
              'One audience is rarely one group. Early adopters tolerate rough edges; mainstream buyers need polish. Researching them together produces mush. Separate them now so each interview has a clear subject.',
            example:
              'For the bottle: “commuter early adopters” and “gym-goers who replace bottles yearly” have different objections and different price ceilings.',
            help: 'Two or three groups is plenty. You will interview a couple of people from each in the next lesson.',
            activity: {
              kind: 'write',
              prompt: 'List the customer groups you will research, and what is different about each.',
              placeholder: 'Group 1: commuters who carry a bag daily — care about leaks. Group 2: gym-goers — care about capacity and cleaning…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'research.customer_groups' },
            xp: 15
          },
          {
            id: 'w2.u1.l2',
            title: 'Understand customer needs',
            summary: 'Record what customers told you, in their words.',
            concept:
              'Research only counts when it is written down somewhere you will read it again. Record what people said, what they currently do, and what they would give up. Quotes beat summaries — summaries drift toward what you hoped to hear.',
            example:
              '“I stopped using my old bottle because it leaked in my backpack and ruined a notebook. I bought a cheap one and replaced it twice this year.”',
            help: 'If you have not spoken to anyone yet, record what you observed instead: reviews, forum posts, complaints. Write where it came from.',
            activity: {
              kind: 'write',
              prompt: 'Record what you learned about customer needs, with a quote or observation for each point.',
              placeholder: 'From two commuter interviews: “it leaked in my backpack and ruined a notebook”…',
              minLength: 30
            },
            bind: { target: 'answer', key: 'research.customer_insight' },
            xp: 15
          },
          {
            id: 'w2.u1.l3',
            title: 'Plan interviews',
            summary: 'Write the questions you will ask, and add them as research work.',
            concept:
              'Good interview questions ask about past behaviour, not hypotheticals. “Would you buy this?” invites polite lies. “What did you do last time your bottle leaked?” produces usable evidence. Turning your plan into tasks means the work is visible and shared.',
            example:
              'Instead of “would you pay $40?”, ask “what did you spend on bottles last year?” The second is a fact; the first is a guess.',
            help: 'Write the actual research tasks below. They are added to your Tasks tab, so the work is visible to anyone on your team and counts toward your Research checkpoint.',
            activity: {
              kind: 'form',
              prompt: 'Write the two research tasks you will do this week.',
              fields: [
                { id: 'task_1', label: 'Research task 1 — who you will talk to and how', type: 'longtext', placeholder: 'Interview three commuters at the station about the last time their bottle leaked', required: true },
                { id: 'task_2', label: 'Research task 2 — who you will talk to and how', type: 'longtext', placeholder: 'Message five apartment gardeners in the building group about how they water', required: true }
              ]
            },
            bind: { target: 'task', key: 'research' },
            xp: 15
          }
        ]
      },
      {
        id: 'w2.u2',
        title: 'Competitor research',
        blurb: 'Know what customers compare you against, including doing nothing.',
        lessons: [
          {
            id: 'w2.u2.l1',
            title: 'Identify alternatives',
            summary: 'Name everything your customer could do instead.',
            concept:
              'Your competitor is not only a similar product — it is every way the customer solves the problem today, including buying nothing. Listing alternatives sets the real bar you must clear.',
            example:
              'For the bottle: other bottles, a reused disposable bottle, a thermos they already own, and “put up with the leak”.',
            help: 'Include “do nothing” and “use what they already own”. These are the most common choices.',
            activity: {
              kind: 'write',
              prompt: 'List every alternative your customer has, including doing nothing.',
              placeholder: '1. Reused disposable bottle. 2. A thermos they already own. 3. Buying a cheap bottle and replacing it. 4. Doing nothing…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'research.alternatives' },
            xp: 10
          },
          {
            id: 'w2.u2.l2',
            title: 'Compare competitors',
            summary: 'Record competitors with a price, a strength and a weakness.',
            concept:
              'A comparison with no prices is a mood. Recording the actual price, what the competitor does well and where they fall short gives you a position to beat and a reference for your own pricing.',
            example:
              '“Bigco Insulated 750ml: $35, excellent cold retention, leaks if the lid is not seated, warranty excludes dents.”',
            help: 'Write at least two competitors. Your own product’s price will be compared against these in World 7.',
            activity: {
              kind: 'form',
              prompt: 'Record two or more competitors with a price and a strength and weakness.',
              fields: [
                { id: 'competitor_1', label: 'Competitor 1 — name, price, strength, weakness', type: 'longtext', placeholder: 'Bigco Insulated 750ml — $35 — great cold retention — lid leaks if not seated', required: true },
                { id: 'competitor_2', label: 'Competitor 2 — name, price, strength, weakness', type: 'longtext', placeholder: 'CheapBottle 500ml — $8 — cheap — dents and leaks within months', required: true }
              ]
            },
            bind: { target: 'research', key: 'competitor' },
            xp: 15
          },
          {
            id: 'w2.u2.l3',
            title: 'Analyse product differences',
            summary: 'State what you will do differently, and what that costs you.',
            concept:
              'Every difference is a trade-off. A thicker wall keeps drinks colder and makes the bottle heavier. Naming the trade-off shows you understand the market you are entering.',
            example:
              '“We use a thicker vacuum wall than CheapBottle. It holds cold twice as long and costs $4 more per unit.”',
            help: 'One clear difference is enough. A product that is different in five ways is usually undifferentiated in all of them.',
            activity: {
              kind: 'write',
              prompt: 'What is the one difference you will win on, and what trade-off does it force?',
              placeholder: 'We hold cold twice as long as the cheap alternative, at $4 more per unit…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'research.differentiation' },
            xp: 15
          }
        ]
      },
      {
        id: 'w2.u3',
        title: 'Market understanding',
        blurb: 'Turn what you found into a market view and a list of what is still unknown.',
        lessons: [
          {
            id: 'w2.u3.l1',
            title: 'Record research evidence',
            summary: 'Capture your findings as evidence on the product.',
            concept:
              'Evidence is what you can point to later when someone asks “how do you know?”. It is a quote, a price, a forum thread or a screenshot description — recorded next to the product, not in your head.',
            example:
              '“Three reviews on CheapBottle mention the lid leaking within two months (review dates March–June).”',
            help: 'Add at least two research entries. They are stored on the product and counted by your Research checkpoint.',
            activity: {
              kind: 'form',
              prompt: 'Record at least two pieces of research evidence.',
              fields: [
                { id: 'evidence_1', label: 'Evidence 1 — what you found and where', type: 'longtext', placeholder: 'Three reviews mention the lid leaking within two months (March–June)', required: true },
                { id: 'evidence_2', label: 'Evidence 2 — what you found and where', type: 'longtext', placeholder: 'Two commuters said they stopped carrying bottles after a leak', required: true }
              ]
            },
            bind: { target: 'research', key: 'evidence' },
            xp: 15
          },
          {
            id: 'w2.u3.l2',
            title: 'Examine market opportunities',
            summary: 'Size what the market will bear for your price.',
            concept:
              'A market opportunity is the number of people who could buy multiplied by what they would pay. You do not need a perfect figure. You need a defensible range so your planning numbers are not fiction.',
            example:
              '“Roughly 40 bottles per month across two local gyms at $35–$40, based on staff estimates.”',
            help: 'If you are pre-revenue, use comparisons and estimates you can defend. Write down where the number came from.',
            activity: {
              kind: 'write',
              prompt: 'What is a defensible estimate of your market, and where did the number come from?',
              placeholder: 'About 40 bottles a month across two gyms, from staff estimates of member bottle use…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'research.market_size' },
            xp: 15
          },
          {
            id: 'w2.u3.l3',
            title: 'Identify unverified assumptions',
            summary: 'Update your assumption list with what research disproved.',
            concept:
              'Research is only useful if it changes something. Go back to the assumptions you wrote in World 1 and mark each one checked, still open, or wrong. Being wrong early is the cheapest thing that happens in this journey.',
            example:
              '“I assumed commuters would not pay $40 — two of four said they had spent more than that on bottles in a year. Still open: whether gym-goers will.”',
            help: 'This updates the same assumptions record you wrote in World 1, so the difference between what you believed then and now is preserved.',
            activity: {
              kind: 'write',
              prompt: 'Which of your World 1 assumptions did research confirm, and which did it contradict?',
              placeholder: 'Confirmed: commuters spend more than $40 a year on bottles. Contradicted: gym-goers do not care about design…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'idea.assumptions' },
            xp: 15
          }
        ]
      }
    ],
    checkpoint: {
      id: 'w2.checkpoint',
      title: 'Research evidence review',
      deliverable: 'A submitted research pack with customer findings, competitor comparisons and recorded evidence.',
      readyWhen:
        'Your product has recorded customer groups, customer insight, at least two alternatives and at least two research entries with evidence. The checkpoint counts real records, not checkboxes.',
      criteria: [
        { id: 'groups', label: 'Customer groups are recorded', bind: { target: 'answer', key: 'research.customer_groups' } },
        { id: 'insight', label: 'Customer needs are recorded', bind: { target: 'answer', key: 'research.customer_insight' } },
        { id: 'alternatives', label: 'Alternatives are recorded', bind: { target: 'answer', key: 'research.alternatives' } },
        { id: 'competitors', label: 'At least two competitors are recorded', bind: { target: 'research', key: 'competitor' }, min: 2 },
        { id: 'evidence', label: 'At least two pieces of evidence are recorded', bind: { target: 'research', key: 'evidence' }, min: 2 }
      ],
      xp: 60
    }
  },

  // ════════════════════════════ WORLD 3 — PLANNING ════════════════════════════
  {
    id: 'w3',
    index: 3,
    stage: 'Planning',
    title: 'Planning',
    blurb: 'Define the MVP, requirements, resources and roadmap.',
    outcome: 'A development plan with a scoped MVP, prioritised features, real costs and a roadmap.',
    units: [
      {
        id: 'w3.u1',
        title: 'Define your MVP',
        blurb: 'Decide the smallest product that proves the idea.',
        lessons: [
          {
            id: 'w3.u1.l1',
            title: 'What an MVP is',
            summary: 'Learn the difference between a small product and an unfinished one.',
            concept:
              'A minimum viable product is the smallest thing that lets a real customer get the real benefit, so you can learn whether the idea works. It is not a broken product, and it is not your full vision. It is a deliberate cut.',
            example:
              'For the bottle, the MVP might be one size, one colour, one lid type — still leak-proof and dishwasher safe, because without those it delivers no benefit at all.',
            help: 'The test: if the MVP works, would a customer choose it over their current alternative? If not, you cut too much.',
            activity: {
              kind: 'choice',
              prompt: 'Which of these is a genuine MVP for the bottle?',
              options: [
                {
                  id: 'one_size',
                  label: 'One size, one colour, leak-proof and dishwasher safe',
                  feedback: 'Correct. It delivers the core benefit at the smallest credible scope.',
                  correct: true
                },
                {
                  id: 'no_lid',
                  label: 'A bottle without a lid, shipped first, lid later',
                  feedback: 'That is an unfinished product, not an MVP. Without a lid it delivers no usable benefit — and it leaks.',
                  correct: false
                },
                {
                  id: 'five_colours',
                  label: 'Five colours, two sizes, gift packaging',
                  feedback: 'That is a full launch, not a minimum. It multiplies cost before you have learned whether anyone wants it.',
                  correct: false
                }
              ]
            },
            bind: { target: 'answer', key: 'planning.mvp_understanding' },
            xp: 10
          },
          {
            id: 'w3.u1.l2',
            title: 'Scope your MVP',
            summary: 'Write what your first version includes and excludes.',
            concept:
              'Scoping means writing both lists. The “includes” list is your commitment; the “excludes” list is your protection against scope creep, which is the most common reason small products never ship.',
            example:
              'Includes: 500ml, double wall, one lid, dishwasher safe.\nExcludes: 750ml, custom colours, engraving, smart lid.',
            help: 'At least three exclusions. If everything is included, nothing has been scoped.',
            activity: {
              kind: 'write',
              prompt: 'What does your MVP include, and what does it deliberately exclude?',
              placeholder: 'Includes: 500ml, double wall, one lid. Excludes: 750ml, custom engraving, smart lid…',
              minLength: 30
            },
            bind: { target: 'answer', key: 'planning.mvp_scope' },
            xp: 20
          },
          {
            id: 'w3.u1.l3',
            title: 'Add MVP requirements',
            summary: 'Turn the MVP scope into requirements on the product.',
            concept:
              'A requirement is a statement a builder can check. “Good quality” cannot be checked. “Survives a 1.5m drop onto concrete without leaking” can. Requirements become the list you test against in World 6.',
            example:
              '“Must hold 500ml ± 10ml.” “Must remain leak-proof when inverted for 24 hours.” “Must survive dishwasher cycles at 60°C.”',
            help: 'Add at least two requirements to the product. They are checked by the Planning and Design checkpoints and reused in Testing.',
            activity: {
              kind: 'form',
              prompt: 'Write at least two testable requirements for your MVP.',
              fields: [
                { id: 'req_1', label: 'Requirement 1', type: 'text', placeholder: 'Must remain leak-proof when inverted for 24 hours', required: true },
                { id: 'req_2', label: 'Requirement 2', type: 'text', placeholder: 'Must hold 500ml ± 10ml', required: true }
              ]
            },
            bind: { target: 'requirement', key: 'mvp' },
            xp: 15
          }
        ]
      },
      {
        id: 'w3.u2',
        title: 'Prioritise features',
        blurb: 'Decide what matters most when you cannot build everything.',
        lessons: [
          {
            id: 'w3.u2.l1',
            title: 'Must, should, could',
            summary: 'Sort features by what happens if you leave them out.',
            concept:
              'MoSCoW sorting asks one question per feature: if this is missing, does the product still deliver the core benefit? Must = no. Should = it hurts but it works. Could = nice to have. This turns a flat wish list into an order.',
            example:
              'Must: leak-proof lid. Should: fits a car cup holder. Could: engraved name.',
            help: 'Keep “Must” to five items or fewer. If everything is a must, you have not prioritised.',
            activity: {
              kind: 'priority',
              prompt: 'Rank your features from most to least critical.',
              priorities: [
                { id: 'leak', label: 'Leak-proof lid', help: 'Without it the product fails its core promise.' },
                { id: 'cold', label: 'Cold retention over 12 hours', help: 'The second half of the promise.' },
                { id: 'wash', label: 'Dishwasher safe', help: 'A strong reason to switch.' }
              ]
            },
            bind: { target: 'answer', key: 'planning.feature_priority' },
            xp: 15
          },
          {
            id: 'w3.u2.l2',
            title: 'Estimate what each feature costs',
            summary: 'Connect features to money before committing.',
            concept:
              'Every feature has a cost — materials, time, or both. A feature that adds $6 to unit cost but only matters to 5% of customers is usually a bad trade for an MVP.',
            example:
              'An engraved name adds a $6 setup plus $3 per unit and delays shipping by a week. For an MVP, it is a “could”, not a “must”.',
            help: 'You do not need exact figures. Relative cost — low, medium, high — is enough to prioritise honestly.',
            activity: {
              kind: 'write',
              prompt: 'Which of your features costs the most to deliver, and is it still worth it?',
              placeholder: 'The smart lid costs $12 per unit in parts; only 5% of interviewed customers asked for it, so it is out of the MVP…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'planning.feature_cost' },
            xp: 15
            },
          {
            id: 'w3.u2.l3',
            title: 'Build your feature list',
            summary: 'Record the features you will build as requirements.',
            concept:
              'Prioritised features become requirements with a priority attached. Keeping them on the product means your design and testing work later has a reference, and your team can see what was deliberately deferred.',
            example:
              '“Leak-proof lid (must)”, “12-hour cold retention (must)”, “dishwasher safe (should)”, “engraving (could — deferred)”',
            help: 'Record at least one additional feature requirement beyond your MVP requirements.',
            activity: {
              kind: 'form',
              prompt: 'Record your prioritised features as requirements.',
              fields: [
                { id: 'feature_1', label: 'Feature and priority', type: 'text', placeholder: 'Leak-proof lid — must', required: true },
                { id: 'feature_2', label: 'Feature and priority', type: 'text', placeholder: 'Dishwasher safe — should', required: false }
              ]
            },
            bind: { target: 'requirement', key: 'feature' },
            xp: 15
          }
        ]
      },
      {
        id: 'w3.u3',
        title: 'Estimate resources and costs',
        blurb: 'Make the unit economics real using the existing cost sheet.',
        lessons: [
          {
            id: 'w3.u3.l1',
            title: 'Add your bill of materials',
            summary: 'List the materials one unit needs.',
            concept:
              'The bill of materials is every physical input per unit, with a quantity. It is the foundation of your unit cost. Without it, every price you set is a guess.',
            example:
              'Steel body 1 pc, lid assembly 1 set, silicone seal 1 pc, packaging 1 pc.',
            help: 'Name the physical inputs and roughly what each costs. They are added to your Materials tab and become the basis of your unit cost.',
            activity: {
              kind: 'form',
              prompt: 'List the materials one unit needs.',
              fields: [
                { id: 'item_1', label: 'Main body material', type: 'longtext', placeholder: 'Stainless steel tube, 500 ml — 1 pc — about ₹120', required: true },
                { id: 'item_2', label: 'Sealing or fastening parts', type: 'longtext', placeholder: 'Silicone lid gasket — 1 pc — about ₹18', required: true },
                { id: 'item_3', label: 'Packaging', type: 'longtext', placeholder: 'Printed kraft box — 1 pc — about ₹22', required: true }
              ]
            },
            bind: { target: 'material', key: 'bom' },
            xp: 20
          },
          {
            id: 'w3.u3.l2',
            title: 'Fill in your labour and overhead',
            summary: 'Account for the costs materials do not cover.',
            concept:
              'Materials are not your whole cost. Someone assembles the product (labour), you need a box and a label (packaging), and rent, tools and electricity must be paid for (overhead). Leaving these out makes a loss look like profit.',
            example:
              'Materials $12, labour $4, packaging $2, overhead $3 — unit cost $21. At a $35 price, margin is 40%.',
            help: 'Enter all three on the Track it tab. The lesson counts them only when each is above zero, so partial entries do not pass.',
            activity: {
              kind: 'form',
              prompt: 'Enter your labour, packaging and overhead per unit.',
              fields: [
                { id: 'labour', label: 'Labour per unit', type: 'money', placeholder: '4', required: true },
                { id: 'packaging', label: 'Packaging per unit', type: 'money', placeholder: '2', required: true },
                { id: 'overhead', label: 'Overhead per unit', type: 'money', placeholder: '3', required: true }
              ]
            },
            bind: { target: 'costs', key: 'costs' },
            xp: 20
          },
          {
            id: 'w3.u3.l3',
            title: 'Check your margin',
            summary: 'Make sure the price leaves you with money.',
            concept:
              'Margin is what is left after unit cost, as a share of price. A 20% margin means 20 cents of every dollar stays after making the product. Below roughly 30% you have little room for returns, discounts or tooling.',
            example:
              'Price $35, unit cost $21 → margin 40%. Price $35, unit cost $30 → margin 14%, which one return could wipe out.',
            help: 'Set the target price on the product and say what margin it gives you. The journey recalculates that margin from your real costs as they change.',
            activity: {
              kind: 'form',
              prompt: 'Set your target price and check the margin it leaves you.',
              fields: [
                { id: 'price', label: 'Target selling price', type: 'money', placeholder: '35', required: true },
                { id: 'margin_note', label: 'What margin does that leave, and is it enough?', type: 'longtext', placeholder: 'About 40% over a $21 unit cost, which covers returns and a launch discount', required: true }
              ]
            },
            bind: { target: 'field', key: 'targetSellingPrice' },
            xp: 15
          }
        ]
      },
      {
        id: 'w3.u4',
        title: 'Build your roadmap',
        blurb: 'Put the work in an order you can actually run.',
        lessons: [
          {
            id: 'w3.u4.l1',
            title: 'Break the plan into tasks',
            summary: 'Turn the roadmap into checklist work.',
            concept:
              'A roadmap that is not broken into tasks is a wish. Each task should be small enough that someone can start it today and know when it is finished.',
            example:
              '“Source steel quotes” instead of “do procurement”. “Test three lid gaskets” instead of “quality work”.',
            help: 'Write three tasks below that someone could start today. They are added to your Tasks tab, which your whole team can see.',
            activity: {
              kind: 'form',
              prompt: 'Write the next three tasks that move this product forward.',
              fields: [
                { id: 'task_1', label: 'Sourcing task', type: 'longtext', placeholder: 'Get quotes from three steel tube suppliers', required: true },
                { id: 'task_2', label: 'Build task', type: 'longtext', placeholder: 'Machine the first prototype body', required: true },
                { id: 'task_3', label: 'Check task', type: 'longtext', placeholder: 'Test the lid gasket for leaks at 60°C', required: true }
              ]
            },
            bind: { target: 'task', key: 'roadmap' },
            xp: 20
          },
          {
            id: 'w3.u4.l2',
            title: 'Order the work',
            summary: 'Decide what must happen before what.',
            concept:
              'Ordering is about dependencies. You cannot test a lid before you have one. Writing the order down prevents the most common stall: two people waiting on each other.',
            example:
              '1. Source steel quotes → 2. Order sample steel → 3. Machine prototype body → 4. Fit and leak-test lid → 5. Run 24-hour test.',
            help: 'Write the order as a numbered list. If two items could be swapped freely, they are probably not dependent.',
            activity: {
              kind: 'write',
              prompt: 'What is the order of work, and what must happen before what?',
              placeholder: '1. Source steel quotes. 2. Order sample steel. 3. Machine body. 4. Fit and leak-test lid…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'planning.roadmap_order' },
            xp: 15
          },
          {
            id: 'w3.u4.l3',
            title: 'Set your launch date',
            summary: 'Commit to a date you can defend.',
            concept:
              'A launch date turns a plan into a schedule. It should come from the work, not from hope. Add up the tasks, allow for the supplier delays you have already experienced, and pick a date you would be comfortable telling a customer.',
            example:
              'Six weeks of build plus two weeks of buffer for supplier delay gives an eight-week date.',
            help: 'Date fields accept any sensible format — write the date you are committing to.',
            activity: {
              kind: 'write',
              prompt: 'What is your target launch date, and what did you build the estimate from?',
              placeholder: 'Eight weeks from now (mid-January), from six weeks of build plus two weeks of supplier buffer…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'planning.launch_date' },
            xp: 15
          }
        ]
      }
    ],
    checkpoint: {
      id: 'w3.checkpoint',
      title: 'Development plan review',
      deliverable: 'A submitted development plan with a scoped MVP, requirements, real costs and a dated roadmap.',
      readyWhen:
        'The MVP is scoped, at least two requirements exist, the bill of materials has at least two lines, labour, packaging and overhead are all above zero, a price is set and at least three tasks exist.',
      criteria: [
        { id: 'scope', label: 'The MVP scope is recorded', bind: { target: 'answer', key: 'planning.mvp_scope' } },
        { id: 'requirements', label: 'At least two requirements exist', bind: { target: 'requirement', key: 'mvp' }, min: 2 },
        { id: 'bom', label: 'The bill of materials has at least two lines', bind: { target: 'material', key: 'bom' }, min: 2 },
        { id: 'costs', label: 'Labour, packaging and overhead are filled in', bind: { target: 'costs', key: 'costs' } },
        { id: 'price', label: 'A target selling price is set', bind: { target: 'field', key: 'targetSellingPrice' } },
        { id: 'tasks', label: 'At least three tasks exist', bind: { target: 'task', key: 'any' }, min: 3 }
      ],
      xp: 70
    }
  },

  // ═════════════════════════════ WORLD 4 — DESIGN ═════════════════════════════
  {
    id: 'w4',
    index: 4,
    stage: 'Design',
    title: 'Design',
    blurb: 'Create product specifications, user journeys and designs.',
    outcome: 'Documented user journeys, requirements and a specification a builder can follow.',
    units: [
      {
        id: 'w4.u1',
        title: 'Understand user journeys',
        blurb: 'Map what the customer does, step by step.',
        lessons: [
          {
            id: 'w4.u1.l1',
            title: 'Map the journey',
            summary: 'Write the steps from "has the problem" to "problem solved".',
            concept:
              'A user journey is the sequence of steps a real person takes around your product. Mapping it exposes the moments where the product has to work and where it can fail.',
            example:
              'Picks up bottle → fills at tap → puts in bag → commutes 40 min → drinks → puts back in bag → washes at night.',
            help: 'Write five or more steps. The awkward steps are the valuable ones — that is where leaks and frustration happen.',
            activity: {
              kind: 'write',
              prompt: 'Write the steps your customer takes, from having the problem to having it solved.',
              placeholder: '1. Notices old bottle leaks. 2. Buys ours. 3. Fills at tap. 4. Puts in bag…',
              minLength: 30
            },
            bind: { target: 'answer', key: 'design.user_journey' },
            xp: 20
          },
          {
            id: 'w4.u1.l2',
            title: 'Find the failure points',
            summary: 'Mark the steps where the product can let the customer down.',
            concept:
              'Most product failures happen at two or three specific steps. Naming them turns a general worry into a design requirement that can be checked in testing.',
            example:
              'Step “puts it in bag” fails if the lid is not seated. Step “washes at night” fails if the seal degrades in hot water.',
            help: 'Pick the two riskiest steps and say what would go wrong at each.',
            activity: {
              kind: 'write',
              prompt: 'Which steps are riskiest, and what would go wrong at each?',
              placeholder: 'In the bag: if the lid is not fully seated it leaks onto a laptop. In the wash: the seal warps at 60°C…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'design.failure_points' },
            xp: 15
          }
        ]
      },
      {
        id: 'w4.u2',
        title: 'Define requirements',
        blurb: 'Turn needs into specifications that can be tested.',
        lessons: [
          {
            id: 'w4.u2.l1',
            title: 'Write testable specifications',
            summary: 'Give each requirement a number and a test.',
            concept:
              'A specification is a requirement with a measure and a method. That trio is what lets a builder know when they are done and lets a tester know when it failed.',
            example:
              'Requirement: leak-proof. Measure: no visible moisture after 24 hours inverted. Method: invert a filled unit and inspect.',
            help: 'Add at least two design specifications. They are stored as requirements with a design type.',
            activity: {
              kind: 'form',
              prompt: 'Write at least two specifications with a measure and a test method.',
              fields: [
                { id: 'spec_1', label: 'Specification 1 — requirement, measure, method', type: 'longtext', placeholder: 'Leak-proof — no visible moisture after 24h inverted — invert a filled unit and inspect', required: true },
                { id: 'spec_2', label: 'Specification 2 — requirement, measure, method', type: 'longtext', placeholder: 'Capacity — 500ml ± 10ml — weigh filled unit', required: true }
              ]
            },
            bind: { target: 'requirement', key: 'design' },
            xp: 20
          },
          {
            id: 'w4.u2.l2',
            title: 'Decide what you will not do',
            summary: 'Record the design decisions you are rejecting.',
            concept:
              'Design is mostly rejection. Recording what you decided against, and why, stops the same debate from restarting every month and preserves the reasoning for whoever comes next.',
            example:
              'Rejected: a screw thread lid — better seal, slower to open and harder to clean. Chose a flip latch instead.',
            help: 'Record at least one decision. It appears on the product’s decision record and your Design checkpoint counts it.',
            activity: {
              kind: 'form',
              prompt: 'Record at least one design decision, including what you rejected and why.',
              fields: [
                { id: 'decision_1', label: 'Decision, alternatives, reason', type: 'longtext', placeholder: 'Flip latch instead of screw thread — faster to open, simpler to clean, acceptable seal', required: true }
              ]
            },
            bind: { target: 'decision', key: 'design' },
            xp: 15
          }
        ]
      },
      {
        id: 'w4.u3',
        title: 'Develop product specifications',
        blurb: 'Assemble a specification package someone else could build from.',
        lessons: [
          {
            id: 'w4.u3.l1',
            title: 'Assemble the specification',
            summary: 'Summarise the build: sizes, materials, tolerances.',
            concept:
              'A specification gathers the numbers a builder needs: overall dimensions, material and finish per part, and the tolerances that matter. Without it, two units are two different products.',
            example:
              'Height 220mm, diameter 70mm, 304 stainless body 0.5mm, food-grade silicone seal, lid tolerance ±0.2mm.',
            help: 'Write the key dimensions and materials already on your bill of materials. The numbers must be yours, not an example.',
            activity: {
              kind: 'write',
              prompt: 'Write the key dimensions, materials and tolerances for your product.',
              placeholder: 'Height 220mm, diameter 70mm, 304 stainless body 0.5mm, silicone seal, lid tolerance ±0.2mm…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'design.specification' },
            xp: 20
          },
          {
            id: 'w4.u3.l2',
            title: 'Check against your requirements',
            summary: 'Verify every requirement is covered by the design.',
            concept:
              'A specification that misses a requirement is a design that will fail testing. Cross-checking is cheap now and expensive later.',
            example:
              'Requirement “dishwasher safe” — is the silicone seal rated for 60°C? If that is not stated, the specification is incomplete.',
            help: 'Name any requirement your current design does not yet cover. Admitting a gap here is what makes the plan trustworthy.',
            activity: {
              kind: 'write',
              prompt: 'Which requirements are fully covered by your design, and which are not yet?',
              placeholder: 'Covered: capacity, leak-proof. Not yet: dishwasher safety — the seal rating is still unconfirmed…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'design.coverage' },
            xp: 15
          }
        ]
      }
    ],
    checkpoint: {
      id: 'w4.checkpoint',
      title: 'Design documentation review',
      deliverable: 'A submitted design pack with a user journey, specifications and recorded decisions.',
      readyWhen:
        'A user journey and failure points are recorded, at least two design specifications exist, at least one design decision is recorded and the specification summary is written.',
      criteria: [
        { id: 'journey', label: 'The user journey is recorded', bind: { target: 'answer', key: 'design.user_journey' } },
        { id: 'failures', label: 'Failure points are recorded', bind: { target: 'answer', key: 'design.failure_points' } },
        { id: 'specs', label: 'At least two design specifications exist', bind: { target: 'requirement', key: 'design' }, min: 2 },
        { id: 'decisions', label: 'At least one design decision is recorded', bind: { target: 'decision', key: 'design' } },
        { id: 'summary', label: 'The specification summary is written', bind: { target: 'answer', key: 'design.specification' } }
      ],
      xp: 70
    }
  },

  // ═══════════════════════════ WORLD 5 — PROTOTYPE ═══════════════════════════
  {
    id: 'w5',
    index: 5,
    stage: 'Prototype',
    title: 'Prototype',
    blurb: 'Develop and track the first working version.',
    outcome: 'A built prototype with tracked work, recorded resources and documented blockers.',
    units: [
      {
        id: 'w5.u1',
        title: 'Prepare development',
        blurb: 'Get everything in place before building.',
        lessons: [
          {
            id: 'w5.u1.l1',
            title: 'Check your inputs',
            summary: 'Confirm materials, tools and drawings are ready.',
            concept:
              'Most prototype delays are not technical — they are missing inputs. Confirming materials, tools and drawings before starting prevents a build that stalls halfway.',
            example:
              'Steel sample ordered, lid drawing approved, press tool booked for Thursday. All three known before day one.',
            help: 'Name the inputs you actually have and the one most likely to arrive late.',
            activity: {
              kind: 'write',
              prompt: 'What inputs do you have ready, and which is most at risk of delay?',
              placeholder: 'Have: steel sample, lid drawing, press booking. At risk: the silicone seal, quoted at three weeks…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'prototype.inputs' },
            xp: 15
          },
          {
            id: 'w5.u1.l2',
            title: 'Plan the build',
            summary: 'Turn the build into dated tasks.',
            concept:
              'A build plan is a sequence with dates. Without dates, prototype work quietly expands to fill whatever time exists.',
            example:
              'Week 1 machine body, week 2 fit lid and seal, week 3 leak and temperature tests.',
            help: 'Write the build tasks below. They are added to your Tasks tab with the rest of your work.',
            activity: {
              kind: 'form',
              prompt: 'Plan the build as tasks.',
              fields: [
                { id: 'task_1', label: 'Parts acquisition task', type: 'longtext', placeholder: 'Order the tube, gasket and packaging stock', required: true },
                { id: 'task_2', label: 'Assembly task', type: 'longtext', placeholder: 'Assemble the first three prototype units', required: true },
                { id: 'task_3', label: 'First test task', type: 'longtext', placeholder: 'Run the leak test on unit one', required: true }
              ]
            },
            bind: { target: 'task', key: 'prototype' },
            xp: 15
          }
        ]
      },
      {
        id: 'w5.u2',
        title: 'Break work into tasks',
        blurb: 'Make progress visible in small, completable pieces.',
        lessons: [
          {
            id: 'w5.u2.l1',
            title: 'Write good tasks',
            summary: 'Make each task startable and finishable.',
            concept:
              'A good task names a verb, an object and a finish condition. “Work on lid” is not a task. “Fit latch to lid and confirm it opens one-handed” is.',
            example:
              'Bad: “QA”. Good: “Leak-test three lid variants for 24 hours and record the result.”',
            help: 'Review your task list and rename anything that could not be marked done unambiguously.',
            activity: {
              kind: 'choice',
              prompt: 'Which of these is a well-formed task?',
              options: [
                { id: 'good', label: 'Leak-test three lid variants for 24 hours and record the result', feedback: 'Correct: verb, object and a finish condition.', correct: true },
                { id: 'vague', label: 'Work on the lid', feedback: 'Not a task — nobody could say when it is finished.', correct: false },
                { id: 'qa', label: 'QA', feedback: 'Not a task — too broad to start or complete.', correct: false }
              ]
            },
            bind: { target: 'task', key: 'prototype' },
            xp: 10
          },
          {
            id: 'w5.u2.l2',
            title: 'Complete work as you go',
            summary: 'Close tasks so progress is real.',
            concept:
              'Progress is only visible when work is marked done. An open task that is actually finished is worse than a finished one, because the plan keeps lying to you.',
            example:
              'Body machined → mark done the same day, not at the end of the project.',
            help: 'Name the work you actually finished. Those tasks are marked done on your Tasks tab, so your plan stops lying to you.',
            activity: {
              kind: 'form',
              prompt: 'Close the tasks you have actually finished.',
              fields: [
                { id: 'done_1', label: 'Finished task 1 — name it exactly as it appears', type: 'longtext', placeholder: 'Order the tube, gasket and packaging stock', required: true },
                { id: 'done_2', label: 'Finished task 2 — name it exactly as it appears', type: 'longtext', placeholder: 'Assemble the first three prototype units', required: true }
              ]
            },
            bind: { target: 'task', key: 'prototype' },
            xp: 15
          }
        ]
      },
      {
        id: 'w5.u3',
        title: 'Track prototype progress',
        blurb: 'Record what you built and what it cost.',
        lessons: [
          {
            id: 'w5.u3.l1',
            title: 'Record what you built',
            summary: 'Document the prototype and its actual cost.',
            concept:
              'The prototype is where estimates meet reality. Recording what it actually cost tells you whether your unit cost from World 3 was close, and where it was wrong.',
            example:
              'Estimated $21 per unit; first prototype cost $48 because the seal was hand-cut. Learning: the seal must be moulded.',
            help: 'Enter what the prototype actually cost for one unit and what that taught you. The figure is recorded against the product.',
            activity: {
              kind: 'form',
              prompt: 'Record what the prototype actually cost you.',
              fields: [
                { id: 'proto_cost', label: 'Actual prototype cost for one unit', type: 'money', placeholder: '48', required: true },
                { id: 'learning', label: 'What did the cost difference teach you?', type: 'longtext', placeholder: 'The hand-cut seal is the cost driver; it must be moulded', required: true }
              ]
            },
            bind: { target: 'answer', key: 'prototype.actual_cost' },
            xp: 20
          },
          {
            id: 'w5.u3.l2',
            title: 'Log a product decision',
            summary: 'Record a change you made during the build.',
            concept:
              'Prototypes almost always change the design. Recording the change and its reason keeps the specification honest and stops the same problem being hit twice.',
            example:
              'Changed the lid thread from 2 to 3 turns — two turns leaked under vibration.',
            help: 'Record at least one prototype decision. It is stored with your design decisions.',
            activity: {
              kind: 'form',
              prompt: 'Record one decision you made while building.',
              fields: [
                { id: 'proto_decision', label: 'What changed, and why', type: 'longtext', placeholder: 'Lid thread changed from 2 to 3 turns — two turns leaked under vibration', required: true }
              ]
            },
            bind: { target: 'decision', key: 'prototype' },
            xp: 15
          }
        ]
      },
      {
        id: 'w5.u4',
        title: 'Document resources and blockers',
        blurb: 'Be honest about what is blocking progress.',
        lessons: [
          {
            id: 'w5.u4.l1',
            title: 'Record your blockers',
            summary: 'Name what is stopping you, in writing.',
            concept:
              'A blocker written down can be attacked. A blocker kept in your head becomes anxiety. Naming it also tells your team where help is needed.',
            example:
              'Blocked: the seal supplier will not quote below 500 units. Needs: a second supplier or a design that uses a stock seal.',
            help: 'Write any current blocker. If there are none, say what the next risk is. Either way it is recorded on the product.',
            activity: {
              kind: 'write',
              prompt: 'What is blocking progress right now, or what is the next risk?',
              placeholder: 'Seal supplier will not quote below 500 units. Options: stock seal redesign or a second supplier…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'prototype.blockers' },
            xp: 15
          },
          {
            id: 'w5.u4.l2',
            title: 'Update the cost sheet',
            summary: 'Keep the unit economics current after the build.',
            concept:
              'After a prototype, your costs are usually wrong in at least one line. Updating the sheet now means the price you set later is based on reality.',
            example:
              'Overhead rose from $3 to $5 because the press needs two hours per unit.',
            help: 'Enter the cost figures the prototype actually produced. They replace the estimates on your Track it tab, so your margin stays honest.',
            activity: {
              kind: 'form',
              prompt: 'Bring the cost sheet in line with what you learned.',
              fields: [
                { id: 'labour', label: 'Labour per unit (hours × rate)', type: 'money', placeholder: '120', required: true },
                { id: 'packaging', label: 'Packaging per unit', type: 'money', placeholder: '22', required: true },
                { id: 'overhead', label: 'Overhead per unit', type: 'money', placeholder: '35', required: true }
              ]
            },
            bind: { target: 'costs', key: 'costs' },
            xp: 15
          }
        ]
      }
    ],
    checkpoint: {
      id: 'w5.checkpoint',
      title: 'Prototype progress review',
      deliverable: 'Submitted evidence that a prototype was built, costed and tracked.',
      readyWhen:
        'A prototype decision is recorded, prototype costs are above zero, at least two tasks are done and your blockers or risks are documented.',
      criteria: [
        { id: 'decision', label: 'A prototype decision is recorded', bind: { target: 'decision', key: 'prototype' } },
        { id: 'costs', label: 'Prototype costs are recorded', bind: { target: 'costs', key: 'costs' } },
        { id: 'tasks', label: 'At least two tasks are complete', bind: { target: 'task', key: 'done' }, min: 2 },
        { id: 'blockers', label: 'Blockers or risks are documented', bind: { target: 'answer', key: 'prototype.blockers' } }
      ],
      xp: 70
    }
  },

  // ════════════════════════════ WORLD 6 — TESTING ════════════════════════════
  {
    id: 'w6',
    index: 6,
    stage: 'Testing',
    title: 'Testing',
    blurb: 'Evaluate product functionality, usability and performance.',
    outcome: 'Recorded test results against your requirements, with evidence and a verdict.',
    units: [
      {
        id: 'w6.u1',
        title: 'Define testing objectives',
        blurb: 'Decide what you are proving before you test.',
        lessons: [
          {
            id: 'w6.u1.l1',
            title: 'Choose what to test',
            summary: 'Pick the requirements that would end the product if they failed.',
            concept:
              'You cannot test everything, and you should not try. Test the requirements whose failure would make the product unsellable — safety, leaks, capacity, durability.',
            example:
              'Leak-proof and dishwasher-safe are existential. Lid colour is not.',
            help: 'Name the two or three requirements you will test first, and why they matter most.',
            activity: {
              kind: 'write',
              prompt: 'Which requirements will you test first, and why those?',
              placeholder: 'Leak-proof (a leak ruins the bag and the reputation), dishwasher-safe (the seal is unproven)…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'testing.objectives' },
            xp: 15
          },
          {
            id: 'w6.u1.l2',
            title: 'Write a test plan',
            summary: 'Say how each test runs and what passes.',
            concept:
              'A test needs three things: what you do, what you measure, and the threshold that counts as a pass. Without the threshold, every result becomes an opinion.',
            example:
              'Invert a filled unit for 24 hours. Pass: no visible moisture inside the bag liner.',
            help: 'Write the plan for your first test with an explicit pass threshold.',
            activity: {
              kind: 'write',
              prompt: 'Write your test plan: procedure, measurement and pass threshold.',
              placeholder: 'Invert a filled unit for 24h in a bag. Pass: no moisture on the liner…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'testing.plan' },
            xp: 15
          }
        ]
      },
      {
        id: 'w6.u2',
        title: 'Conduct testing',
        blurb: 'Run the tests and record what actually happened.',
        lessons: [
          {
            id: 'w6.u2.l1',
            title: 'Run and record the test',
            summary: 'Log the result against the requirement.',
            concept:
              'A test result belongs next to the requirement it checks, with the date and the outcome. Recorded as data, results can be counted; recorded as prose, they cannot.',
            example:
              'Leak-proof — 24h inverted — pass — two units — 12 March.',
            help: 'Record two separate tests — a product that passes one check is not tested. Each is stored as a result with the requirement it checks, and your Testing checkpoint counts them.',
            activity: {
              kind: 'form',
              prompt: 'Record the two tests you ran.',
              fields: [
                { id: 'test_name', label: 'What was tested', type: 'text', placeholder: 'Leak-proof, 24h inverted', required: true },
                { id: 'test_1', label: 'Test 1 — the check and its outcome', type: 'longtext', placeholder: 'Leak-proof — no moisture on liner after 24h — two units — 12 March', required: true },
                { id: 'test_2', label: 'Test 2 — a different check and its outcome', type: 'longtext', placeholder: 'Drop test — survived 1.5 m onto concrete — one unit — 13 March', required: true }
              ]
            },
            bind: { target: 'test', key: 'functional' },
            xp: 20
          },
          {
            id: 'w6.u2.l2',
            title: 'Test with a real person',
            summary: 'Watch someone use it without your help.',
            concept:
              'Your own testing proves the product works. Watching a real customer proves it works for someone who has not read your instructions. The gap between those two is usually the most valuable finding you will get.',
            example:
              'Two of three testers did not seat the lid fully, and one leaked. The design assumed knowledge the customer does not have.',
            help: 'Write what you observed, not what you hoped. Include at least one thing that surprised you.',
            activity: {
              kind: 'write',
              prompt: 'What did a real user do that you did not expect?',
              placeholder: 'Two of three did not seat the lid fully and one leaked — they assumed it clicks like a bottle cap…',
              minLength: 25
            },
            bind: { target: 'feedback', key: 'usability' },
            xp: 20
          }
        ]
      },
      {
        id: 'w6.u3',
        title: 'Record feedback and issues',
        blurb: 'Turn what you saw into a recorded list of problems.',
        lessons: [
          {
            id: 'w6.u3.l1',
            title: 'Log the issues you found',
            summary: 'Record each problem as a feedback item.',
            concept:
              'Each problem you observed is a feedback item tied to the product. Written individually, they can be prioritised and closed. Written as one paragraph, they get forgotten.',
            example:
              'Issue 1: lid does not click when seated. Issue 2: seal squeaks when opening. Issue 3: bottle does not fit a car cup holder.',
            help: 'Record at least three feedback items. They become your improvement backlog in World 8.',
            activity: {
              kind: 'form',
              prompt: 'Log three or more issues found in testing.',
              fields: [
                { id: 'issue_1', label: 'Issue 1', type: 'text', placeholder: 'Lid does not click when seated', required: true },
                { id: 'issue_2', label: 'Issue 2', type: 'text', placeholder: 'Seal squeaks when opening', required: true },
                { id: 'issue_3', label: 'Issue 3', type: 'text', placeholder: 'Does not fit a car cup holder', required: true }
              ]
            },
            bind: { target: 'feedback', key: 'testing' },
            xp: 20
          },
          {
            id: 'w6.u3.l2',
            title: 'Separate severity from annoyance',
            summary: 'Decide which issues block launch.',
            concept:
              'Not every issue must be fixed before launch, but some must. Severity is about consequence: a leak ruins a bag; a squeak is a note in the manual.',
            example:
              'Blocker: lid leaks when not clicked. Not a blocker: seal squeaks — mention in the guide.',
            help: 'Say which issues block launch and which can ship with a workaround.',
            activity: {
              kind: 'write',
              prompt: 'Which issues block launch, and which can ship with a workaround?',
              placeholder: 'Blockers: lid leaking. Ships with note: squeaky seal, cup-holder fit…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'testing.severity' },
            xp: 15
          }
        ]
      },
      {
        id: 'w6.u4',
        title: 'Evaluate results',
        blurb: 'Decide whether the product passes.',
        lessons: [
          {
            id: 'w6.u4.l1',
            title: 'Evaluate against your thresholds',
            summary: 'Compare results to the plan, honestly.',
            concept:
              'Evaluation means comparing what happened to what you said would count as a pass. It is where a test stops being an anecdote.',
            example:
              'Planned pass: no moisture after 24h. Observed: one of two units leaked after 18h. Verdict: fail, fix the lid before launch.',
            help: 'Give each result a clear verdict. A recorded fail is more valuable than an unrecorded pass.',
            activity: {
              kind: 'choice',
              prompt: 'A test you planned as a pass failed. What do you do?',
              options: [
                { id: 'record_fix', label: 'Record the failure, add it to the improvement list, fix and retest', feedback: 'Correct. A recorded failure is evidence; a hidden one is a future return.', correct: true },
                { id: 'ignore', label: 'Ignore it — it probably was not representative', feedback: 'That discards your only real evidence and ships a known defect.', correct: false },
                { id: 'widen', label: 'Change the pass threshold to match the result', feedback: 'Changing the goalposts after the test makes the test worthless.', correct: false }
              ]
            },
            bind: { target: 'answer', key: 'testing.verdict' },
            xp: 15
          },
          {
            id: 'w6.u4.l2',
            title: 'Record the final verdict',
            summary: 'Write whether the product is ready.',
            concept:
              'The final verdict is a decision with consequences, and it belongs on the record. It is what tells your team whether to launch or go back.',
            example:
              'Ready to launch after fixing the lid click; all blockers resolved; two notes added to the guide.',
            help: 'State the verdict explicitly: ready, ready with conditions, or not ready.',
            activity: {
              kind: 'write',
              prompt: 'What is your testing verdict, and any conditions attached?',
              placeholder: 'Ready with conditions: fix the lid click and retest; ship with a cup-holder note…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'testing.conclusion' },
            xp: 15
          }
        ]
      }
    ],
    checkpoint: {
      id: 'w6.checkpoint',
      title: 'Testing records review',
      deliverable: 'Submitted test results, observed feedback and a recorded verdict.',
      readyWhen:
        'At least two test results are recorded, at least three feedback items exist and a verdict is recorded.',
      criteria: [
        { id: 'objectives', label: 'Testing objectives are recorded', bind: { target: 'answer', key: 'testing.objectives' } },
        { id: 'results', label: 'At least two test results are recorded', bind: { target: 'test', key: 'any' }, min: 2 },
        { id: 'feedback', label: 'At least three feedback items are recorded', bind: { target: 'feedback', key: 'any' }, min: 3 },
        { id: 'verdict', label: 'A verdict is recorded', bind: { target: 'answer', key: 'testing.verdict' } }
      ],
      xp: 80
    }
  },

  // ═════════════════════════════ WORLD 7 — LAUNCH ═════════════════════════════
  {
    id: 'w7',
    index: 7,
    stage: 'Launch',
    title: 'Launch',
    blurb: 'Prepare release, pricing and go-to-market activities.',
    outcome: 'A pricing decision, a go-to-market plan and a launch checklist that is genuinely ready.',
    units: [
      {
        id: 'w7.u1',
        title: 'Finalise your product',
        blurb: 'Lock the version you are shipping.',
        lessons: [
          {
            id: 'w7.u1.l1',
            title: 'Lock the launch version',
            summary: 'Record what is in the shipping product.',
            concept:
              'The launch version is a promise. Recording exactly what ships — and what is deferred — stops version drift during launch week, when everyone is busy.',
            example:
              'Ships: 500ml, double wall, flip latch, one colour. Deferred: 750ml, engraving, second colour.',
            help: 'Name what ships and what is deferred. Deferred work is not failure; it is a roadmap.',
            activity: {
              kind: 'write',
              prompt: 'What ships in version 1, and what is deferred?',
              placeholder: 'Ships: 500ml, double wall, flip latch, one colour. Deferred: 750ml, engraving…',
              minLength: 25
            },
            bind: { target: 'answer', key: 'launch.version' },
            xp: 15
          },
          {
            id: 'w7.u1.l2',
            title: 'Confirm launch blockers are closed',
            summary: 'Close the issues that would stop you shipping.',
            concept:
              'A launch blocker is an issue whose presence makes shipping a mistake. Before launch, each blocker must be closed and its test rerun to confirm.',
            example:
              'Lid leak blocker closed by a longer latch; 24-hour retest passed on three units.',
            help: 'Record the closure and the retest. The Testing tab holds the issues you logged.',
            activity: {
              kind: 'write',
              prompt: 'Which launch blockers did you close, and what proved they are fixed?',
              placeholder: 'Lid leak: latch lengthened 2mm, 24h retest passed on three units…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'launch.blockers_closed' },
            xp: 20
          }
        ]
      },
      {
        id: 'w7.u2',
        title: 'Develop pricing',
        blurb: 'Choose a price that covers cost and matches the market.',
        lessons: [
          {
            id: 'w7.u2.l1',
            title: 'Price from cost and market',
            summary: 'Set a price using your real numbers.',
            concept:
              'Price has two anchors: your unit cost sets the floor, and the competing alternatives set the ceiling. Anything between is a judgement about value, and your margin is what lets you survive returns and discounts.',
            example:
              'Unit cost $21 sets the floor at roughly $26 for a 20% margin. Competitors sit at $8 and $35. A $32 price undercuts the premium option and holds a 34% margin.',
            help: 'Set the target selling price on the product. The lesson reads the real value from your cost sheet.',
            activity: {
              kind: 'form',
              prompt: 'Set your launch price and say why it sits there.',
              fields: [
                { id: 'price', label: 'Launch price', type: 'money', placeholder: '32', required: true },
                { id: 'rationale', label: 'Why this price, given your costs and competitors', type: 'longtext', placeholder: 'Undercuts Bigco at $35 while holding 34% margin over a $21 unit cost', required: true }
              ]
            },
            bind: { target: 'field', key: 'targetSellingPrice' },
            xp: 20
          },
          {
            id: 'w7.u2.l2',
            title: 'Check the margin you will live with',
            summary: 'Make sure the price survives real-world costs.',
            concept:
              'The margin you calculate is your best case. Returns, payment fees, freight and discounts all come out of it. A 30% margin can become 20% before the first repeat customer.',
            example:
              '$32 price, $21 cost → 34% margin. After 5% payment fees and a 10% return rate, the realistic margin is closer to 24%.',
            help: 'Write the margin you are accepting and what could erode it.',
            activity: {
              kind: 'write',
              prompt: 'What margin are you accepting, and what could reduce it?',
              placeholder: '34% at $32; realistically about 24% after fees and returns…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'launch.margin_check' },
            xp: 15
          }
        ]
      },
      {
        id: 'w7.u3',
        title: 'Plan your go-to-market',
        blurb: 'Decide how the first customers find you.',
        lessons: [
          {
            id: 'w7.u3.l1',
            title: 'Choose your first channel',
            summary: 'Pick where your first customers already are.',
            concept:
              'Your first channel should be somewhere your researched customers already spend attention. A channel that requires you to build an audience from nothing is a second product.',
            example:
              'Two local gyms and a commuter forum, because that is where the interviewed customers already were.',
            help: 'Name one primary channel and why it reaches the customers you researched.',
            activity: {
              kind: 'write',
              prompt: 'What is your first channel, and why does it reach your researched customers?',
              placeholder: 'A commuter forum, because two of the four interviewed customers post there daily…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'launch.channel' },
            xp: 15
          },
          {
            id: 'w7.u3.l2',
            title: 'Write your launch message',
            summary: 'Say what you do, for whom, in one line.',
            concept:
              'The launch message is your value proposition, tested for brevity. It has to work in a forum post title and in a sentence spoken at a gym.',
            example:
              '“The only insulated bottle that survives a commute, a gym locker and a dishwasher without leaking.”',
            help: 'Use the value proposition you wrote in World 1 as the starting point.',
            activity: {
              kind: 'write',
              prompt: 'Write the one line you will use to launch your product.',
              placeholder: 'The only insulated bottle that survives a commute, a gym locker and a dishwasher…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'launch.message' },
            xp: 15
          },
          {
            id: 'w7.u3.l3',
            title: 'Define success for launch',
            summary: 'Say what a good launch looks like in numbers.',
            concept:
              'A launch target turns celebration into measurement. Without it, every launch is a success in the telling and a mystery in the learning.',
            example:
              'Success: 40 units sold in the first month with fewer than three returns.',
            help: 'Give one number and one quality bar. Both should be checkable.',
            activity: {
              kind: 'write',
              prompt: 'What does a successful launch look like, in numbers?',
              placeholder: '40 units in month one, fewer than three returns, two repeat buyers…',
              minLength: 15
            },
            bind: { target: 'answer', key: 'launch.success' },
            xp: 15
          }
        ]
      },
      {
        id: 'w7.u4',
        title: 'Prepare for release',
        blurb: 'Make sure everything is in place on the day.',
        lessons: [
          {
            id: 'w7.u4.l1',
            title: 'Build the release checklist',
            summary: 'List the work that must happen before you announce.',
            concept:
              'Release work is boring and essential: stock, packaging, support answers, returns policy, and someone watching the channel for questions. Written as tasks, none of it is remembered at 11pm.',
            example:
              'Stock packed; returns page live; five support answers drafted; channel posts scheduled; family warned.',
                        help: 'Write the launch tasks below. They appear on your Tasks tab so the launch day is runnable by someone other than you.',
            activity: {
              kind: 'form',
              prompt: 'Put the launch work on the product as tasks.',
              fields: [
                { id: 'task_1', label: 'Stock and packaging task', type: 'longtext', placeholder: 'Pack the first 50 units and label the boxes', required: true },
                { id: 'task_2', label: 'Support and returns task', type: 'longtext', placeholder: 'Set up a returns inbox and name the responder', required: true },
                { id: 'task_3', label: 'Channel and announcement task', type: 'longtext', placeholder: 'Schedule the launch announcement', required: true }
              ]
            },
            bind: { target: 'task', key: 'launch' },
            xp: 15
          },
          {
            id: 'w7.u4.l2',
            title: 'Decide how you will learn from launch',
            summary: 'Set up the feedback you will collect.',
            concept:
              'The launch is the start of your learning, not the end of your work. Deciding now how you will collect feedback — reviews, emails, returns reasons — means World 8 starts with data instead of memory.',
            example:
              'Collect: every return reason, a two-week follow-up email, and a weekly read of the forum thread.',
            help: 'Name the sources you will read, and when.',
            activity: {
              kind: 'write',
              prompt: 'How will you collect feedback after launch, and how often will you read it?',
              placeholder: 'Return reasons weekly, a two-week follow-up email, and the forum thread each Friday…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'launch.feedback_plan' },
            xp: 15
          }
        ]
      }
    ],
    checkpoint: {
      id: 'w7.checkpoint',
      title: 'Launch readiness review',
      deliverable: 'Submitted pricing, go-to-market plan and launch checklist.',
      readyWhen:
        'The price is set, the version and launch message are recorded, a success measure exists and at least two launch tasks are on the product.',
      criteria: [
        { id: 'version', label: 'The launch version is recorded', bind: { target: 'answer', key: 'launch.version' } },
        { id: 'price', label: 'A launch price is set', bind: { target: 'field', key: 'targetSellingPrice' } },
        { id: 'channel', label: 'A launch channel is recorded', bind: { target: 'answer', key: 'launch.channel' } },
        { id: 'message', label: 'The launch message is written', bind: { target: 'answer', key: 'launch.message' } },
        { id: 'success', label: 'A launch success measure is recorded', bind: { target: 'answer', key: 'launch.success' } },
        { id: 'tasks', label: 'At least two launch tasks exist', bind: { target: 'task', key: 'launch' }, min: 2 }
      ],
      xp: 90
    }
  },

  // ══════════════════════════ WORLD 8 — IMPROVEMENT ══════════════════════════
  {
    id: 'w8',
    index: 8,
    stage: 'Improvement',
    title: 'Improvement',
    blurb: 'Analyse feedback, measure performance and continuously improve.',
    outcome: 'A measured performance review, a prioritised improvement backlog and a next-iteration plan.',
    units: [
      {
        id: 'w8.u1',
        title: 'Review product performance',
        blurb: 'Measure what actually happened.',
        lessons: [
          {
            id: 'w8.u1.l1',
            title: 'Compare results to your targets',
            summary: 'Check your launch numbers against your success measure.',
            concept:
              'Performance is measured against the target you set before launch. Comparing afterwards to a target chosen afterwards is how products drift into self-congratulation.',
            example:
              'Target 40 units, 3 returns. Actual 28 units, 5 returns. 70% of target, and the returns rate is the real story.',
            help: 'Use the numbers you recorded at launch. If you have no sales yet, use the best available proxy and say so.',
            activity: {
              kind: 'write',
              prompt: 'What were your launch numbers against your target?',
              placeholder: '28 of 40 target units, 5 returns against a target of 3…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'improvement.performance' },
            xp: 20
          },
          {
            id: 'w8.u1.l2',
            title: 'Find the most expensive problem',
            summary: 'Work out which issue costs you the most.',
            concept:
              'Five returns cost more than a hundred squeaky seals. Multiplying an issue by its frequency and its cost tells you where a fix pays for itself.',
            example:
              'Five returns × $32 refund = $160 lost, plus shipping both ways. The squeak costs nothing but a support email.',
            help: 'Name the most expensive problem and the arithmetic behind it.',
            activity: {
              kind: 'write',
              prompt: 'Which problem costs you the most, and how did you work that out?',
              placeholder: 'Lid leaks: five returns at $32 plus shipping both ways, about $190 in month one…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'improvement.costliest' },
            xp: 15
          }
        ]
      },
      {
        id: 'w8.u2',
        title: 'Understand customer feedback',
        blurb: 'Read what customers actually said.',
        lessons: [
          {
            id: 'w8.u2.l1',
            title: 'Group the feedback',
            summary: 'Cluster comments into themes.',
            concept:
              'Individual comments are noise; themes are signal. Grouping the feedback you collected shows which problems recur and which are one person having a bad day.',
            example:
              'Of 12 comments: 6 about lid seating, 3 about size, 2 about colour, 1 about price.',
            help: 'Record the themes and the count behind each. Your existing feedback items are the source.',
            activity: {
              kind: 'write',
              prompt: 'What themes appear in your customer feedback, and how often?',
              placeholder: '6 of 12 comments about lid seating, 3 about size, 2 colour, 1 price…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'improvement.themes' },
            xp: 15
          },
          {
            id: 'w8.u2.l2',
            title: 'Hear the strongest objection',
            summary: 'Record the complaint that would stop a repeat purchase.',
            concept:
              'The most valuable feedback is the reason someone would not buy again. It is uncomfortable and it is the thing that compounds if ignored.',
            example:
              '“I like it, but I would not buy a second one until the lid clicks.”',
            help: 'Quote it directly if you can. Paraphrasing softens feedback past usefulness.',
            activity: {
              kind: 'write',
              prompt: 'What is the strongest objection a customer raised?',
              placeholder: '“I like it, but I would not buy a second one until the lid clicks.”',
              minLength: 20
            },
            bind: { target: 'feedback', key: 'objection' },
            xp: 15
          }
        ]
      },
      {
        id: 'w8.u3',
        title: 'Identify improvements',
        blurb: 'Turn feedback into a ranked backlog.',
        lessons: [
          {
            id: 'w8.u3.l1',
            title: 'Write the improvement backlog',
            summary: 'Record each improvement as a feedback item.',
            concept:
              'An improvement backlog is a list of changes you will consider, in priority order. It has to live with the product, not in a note on someone’s phone.',
            example:
              '1. Lid click detent. 2. Cup-holder profile. 3. Second colour. 4. Retail packaging.',
            help: 'Record at least two improvements. They join your existing feedback list and are counted in the Improvement checkpoint.',
            activity: {
              kind: 'form',
              prompt: 'Log the improvements you are considering.',
              fields: [
                { id: 'improvement_1', label: 'Improvement 1', type: 'text', placeholder: 'Lid click detent so seating is unambiguous', required: true },
                { id: 'improvement_2', label: 'Improvement 2', type: 'text', placeholder: 'Cup-holder profile', required: true }
              ]
            },
            bind: { target: 'feedback', key: 'improvement' },
            xp: 20
          },
          {
            id: 'w8.u3.l2',
            title: 'Rank by impact and effort',
            summary: 'Fix the cheap, high-impact things first.',
            concept:
              'A change that removes your most expensive problem and costs little is an obvious win. A redesign that costs three months for the same effect is not, even if it is more satisfying to plan.',
            example:
              'Lid detent: high impact, low effort → next. Second colour: low impact, moderate effort → later.',
            help: 'Rank at least two improvements and say why the first is first.',
            activity: {
              kind: 'priority',
              prompt: 'Rank your improvements by impact against effort.',
              priorities: [
                { id: 'detent', label: 'Lid click detent', help: 'Removes your most expensive problem for a small tooling change.' },
                { id: 'cupholder', label: 'Cup-holder profile', help: 'Moderate impact, moderate effort.' },
                { id: 'colour', label: 'Second colour', help: 'Low impact, moderate effort — later.' }
              ]
            },
            bind: { target: 'answer', key: 'improvement.priority' },
            xp: 15
          }
        ]
      },
      {
        id: 'w8.u4',
        title: 'Plan the next iteration',
        blurb: 'Decide what version two is.',
        lessons: [
          {
            id: 'w8.u4.l1',
            title: 'Define version two',
            summary: 'Commit to what changes next.',
            concept:
              'An iteration plan turns a backlog into a version. Choosing a small set of changes and a date makes the next round of work real instead of aspirational.',
            example:
              'V2: lid detent, cup-holder profile, no other changes. Target: six weeks.',
            help: 'Name the changes included in v2 and what is deferred to v3.',
            activity: {
              kind: 'write',
              prompt: 'What is in version two, and what is deferred?',
              placeholder: 'V2: lid detent and cup-holder profile. Deferred: second colour, retail packaging…',
              minLength: 20
            },
            bind: { target: 'answer', key: 'improvement.v2' },
            xp: 15
          },
          {
            id: 'w8.u4.l2',
            title: 'Close the loop',
            summary: 'Add the next iteration work as tasks.',
            concept:
              'The loop only closes when the plan becomes tasks. Otherwise the improvement lives in this document and nowhere else, and the next round starts from zero.',
            example:
              'Tasks: model new detent, machine two samples, retest lid, update drawing.',
                        help: 'Write the next-iteration tasks below. They carry this improvement cycle into the next one.',
            activity: {
              kind: 'form',
              prompt: 'Turn the next iteration into tasks.',
              fields: [
                { id: 'task_1', label: 'Design change task', type: 'longtext', placeholder: 'Widen the lid thread by 0.4 mm', required: true },
                { id: 'task_2', label: 'Retest task', type: 'longtext', placeholder: 'Re-run the leak test against the seal requirement', required: true }
              ]
            },
            bind: { target: 'task', key: 'improvement' },
            xp: 20
          }
        ]
      }
    ],
    checkpoint: {
      id: 'w8.checkpoint',
      title: 'Improvement plan review',
      deliverable: 'Submitted performance review, customer themes and a next-iteration plan.',
      readyWhen:
        'Performance against target is recorded, feedback themes and the strongest objection are recorded, at least two improvements exist and version two is defined with tasks.',
      criteria: [
        { id: 'performance', label: 'Performance against target is recorded', bind: { target: 'answer', key: 'improvement.performance' } },
        { id: 'themes', label: 'Feedback themes are recorded', bind: { target: 'answer', key: 'improvement.themes' } },
        { id: 'improvements', label: 'At least two improvements are recorded', bind: { target: 'feedback', key: 'improvement' }, min: 2 },
        { id: 'v2', label: 'Version two is defined', bind: { target: 'answer', key: 'improvement.v2' } }
      ],
      xp: 100
    }
  }
];

// ── Lookups ────────────────────────────────────────────────────────────────

export const WORLD_BY_STAGE = new Map<StageId, World>(WORLDS.map((w) => [w.stage, w]));

export const ALL_LESSONS: Lesson[] = WORLDS.flatMap((w) => w.units.flatMap((u) => u.lessons));

export const LESSON_BY_ID = new Map<string, Lesson>(ALL_LESSONS.map((l) => [l.id, l]));

export const CHECKPOINT_BY_ID = new Map<string, Checkpoint>(WORLDS.map((w) => [w.checkpoint.id, w.checkpoint]));

export function worldForLesson(lessonId: string): World | undefined {
  return WORLDS.find((w) => w.units.some((u) => u.lessons.some((l) => l.id === lessonId)));
}

export function unitForLesson(lessonId: string): Unit | undefined {
  return WORLDS.flatMap((w) => w.units).find((u) => u.lessons.some((l) => l.id === lessonId));
}

/** Total lessons across the eight worlds. Used for "x of y lessons" figures. */
export const TOTAL_LESSONS = ALL_LESSONS.length;

/** Total XP available from lessons and checkpoints across the whole journey. */
export const TOTAL_JOURNEY_XP =
  ALL_LESSONS.reduce((sum, l) => sum + l.xp, 0) + WORLDS.reduce((sum, w) => sum + w.checkpoint.xp, 0);
