import type { StageId } from './stages.js';

/**
 * Discovery questions ("Tell us"). Each lifecycle stage has a short set of
 * questions. Answering them earns XP, fills in the stage quest, and gives the
 * insight engine (rules today, AI later) the context it needs.
 *
 * Keys are stable identifiers stored with every answer, so never rename a key —
 * add a new question and retire the old one with `retired: true` instead.
 */

export type QuestionType = 'text' | 'longtext' | 'number' | 'money' | 'choice' | 'multi' | 'scale' | 'yesno' | 'date';

export interface Question {
  key: string;
  stage: StageId;
  prompt: string;
  help?: string;
  placeholder?: string;
  type: QuestionType;
  options?: string[];
  /** Labels for the two ends of a 1–5 scale. */
  scale?: [string, string];
  /** Counts toward stage readiness. Optional questions still earn XP. */
  required: boolean;
  xp: number;
  /** When answered, the value is also written to this product field. */
  syncsTo?: 'targetSellingPrice' | 'description' | 'category';
  retired?: boolean;
}

export const QUESTION_BANK: Question[] = [
  // ── Idea ────────────────────────────────────────────────────────────────
  {
    key: 'idea.problem',
    stage: 'Idea',
    prompt: 'What problem does this product solve?',
    help: 'One or two sentences in your customer’s words.',
    placeholder: 'My customers keep losing…',
    type: 'longtext',
    required: true,
    xp: 15
  },
  {
    key: 'idea.customer',
    stage: 'Idea',
    prompt: 'Who is it for?',
    help: 'Be specific: “remote designers who work from small desks” beats “everyone”.',
    type: 'text',
    required: true,
    xp: 10
  },
  {
    key: 'idea.oneliner',
    stage: 'Idea',
    prompt: 'Describe the product in one line.',
    type: 'text',
    required: true,
    xp: 10,
    syncsTo: 'description'
  },
  {
    key: 'idea.category',
    stage: 'Idea',
    prompt: 'Which category does it belong to?',
    type: 'text',
    placeholder: 'e.g. Drinkware, Lighting, Accessories',
    required: false,
    xp: 5,
    syncsTo: 'category'
  },
  {
    key: 'idea.excitement',
    stage: 'Idea',
    prompt: 'How excited are you about this idea?',
    type: 'scale',
    scale: ['Just a hunch', 'Can’t stop thinking about it'],
    required: false,
    xp: 5
  },

  // ── Research ────────────────────────────────────────────────────────────
  {
    key: 'research.competitors',
    stage: 'Research',
    prompt: 'Who else sells something like this?',
    help: 'List 2–3 competitors or alternatives, with their prices if you know them.',
    type: 'longtext',
    required: true,
    xp: 15
  },
  {
    key: 'research.market_price',
    stage: 'Research',
    prompt: 'What do similar products usually sell for?',
    help: 'A typical retail price in your market.',
    type: 'money',
    required: true,
    xp: 10
  },
  {
    key: 'research.validated',
    stage: 'Research',
    prompt: 'Have you spoken to at least 5 potential customers?',
    type: 'yesno',
    required: true,
    xp: 15
  },
  {
    key: 'research.differentiator',
    stage: 'Research',
    prompt: 'What makes yours different or better?',
    type: 'longtext',
    required: true,
    xp: 10
  },
  {
    key: 'research.channels',
    stage: 'Research',
    prompt: 'Where will customers buy it?',
    type: 'multi',
    options: ['Own website', 'Marketplaces', 'Retail stores', 'Wholesale / B2B', 'Social commerce', 'Pop-ups & events'],
    required: false,
    xp: 5
  },

  // ── Planning ────────────────────────────────────────────────────────────
  {
    key: 'planning.target_price',
    stage: 'Planning',
    prompt: 'What price do you want to sell it at?',
    help: 'Your target selling price per unit. You can change it later.',
    type: 'money',
    required: true,
    xp: 15,
    syncsTo: 'targetSellingPrice'
  },
  {
    key: 'planning.target_margin',
    stage: 'Planning',
    prompt: 'What gross margin are you aiming for (%)?',
    help: 'Most physical products aim for 40–60%.',
    type: 'number',
    required: true,
    xp: 10
  },
  {
    key: 'planning.first_batch',
    stage: 'Planning',
    prompt: 'How many units will your first batch be?',
    type: 'number',
    required: true,
    xp: 10
  },
  {
    key: 'planning.launch_date',
    stage: 'Planning',
    prompt: 'When do you want to launch?',
    type: 'date',
    required: true,
    xp: 10
  },
  {
    key: 'planning.budget',
    stage: 'Planning',
    prompt: 'What is your total budget to get to launch?',
    type: 'money',
    required: false,
    xp: 5
  },

  // ── Design ──────────────────────────────────────────────────────────────
  {
    key: 'design.must_haves',
    stage: 'Design',
    prompt: 'What are the 3 must-have features?',
    type: 'longtext',
    required: true,
    xp: 15
  },
  {
    key: 'design.materials_chosen',
    stage: 'Design',
    prompt: 'Have you chosen the main materials?',
    help: 'Add them in the Materials tab so costs are tracked automatically.',
    type: 'yesno',
    required: true,
    xp: 10
  },
  {
    key: 'design.dimensions',
    stage: 'Design',
    prompt: 'What are the key dimensions and weight?',
    type: 'text',
    required: false,
    xp: 5
  },
  {
    key: 'design.sustainability',
    stage: 'Design',
    prompt: 'How sustainable is the design?',
    type: 'scale',
    scale: ['Not considered yet', 'Core to the product'],
    required: false,
    xp: 5
  },

  // ── Prototype ───────────────────────────────────────────────────────────
  {
    key: 'prototype.version',
    stage: 'Prototype',
    prompt: 'Which prototype version are you on?',
    type: 'choice',
    options: ['Sketch / mock-up', 'v1 looks-like', 'v1 works-like', 'v2+', 'Pre-production sample'],
    required: true,
    xp: 10
  },
  {
    key: 'prototype.learnings',
    stage: 'Prototype',
    prompt: 'What did the latest prototype teach you?',
    type: 'longtext',
    required: true,
    xp: 15
  },
  {
    key: 'prototype.cost_confidence',
    stage: 'Prototype',
    prompt: 'How confident are you in your cost per unit?',
    type: 'scale',
    scale: ['Rough guess', 'Supplier-quoted'],
    required: true,
    xp: 10
  },

  // ── Testing ─────────────────────────────────────────────────────────────
  {
    key: 'testing.criteria',
    stage: 'Testing',
    prompt: 'What must pass before you launch?',
    help: 'e.g. drop test, leak test, safety certification.',
    type: 'longtext',
    required: true,
    xp: 15
  },
  {
    key: 'testing.testers',
    stage: 'Testing',
    prompt: 'How many people have tested it?',
    type: 'number',
    required: true,
    xp: 10
  },
  {
    key: 'testing.satisfaction',
    stage: 'Testing',
    prompt: 'How happy were testers overall?',
    type: 'scale',
    scale: ['Unhappy', 'Delighted'],
    required: true,
    xp: 10
  },
  {
    key: 'testing.certifications',
    stage: 'Testing',
    prompt: 'Which certifications does it need?',
    type: 'multi',
    options: ['None', 'CE', 'FCC', 'UL', 'RoHS', 'FDA / food-safe', 'BIS', 'Other'],
    required: false,
    xp: 5
  },

  // ── Launch ──────────────────────────────────────────────────────────────
  {
    key: 'launch.date',
    stage: 'Launch',
    prompt: 'When did (or will) it go on sale?',
    type: 'date',
    required: true,
    xp: 10
  },
  {
    key: 'launch.first_month_units',
    stage: 'Launch',
    prompt: 'How many units do you expect to sell in the first month?',
    type: 'number',
    required: true,
    xp: 10
  },
  {
    key: 'launch.plan',
    stage: 'Launch',
    prompt: 'How will people hear about it?',
    type: 'longtext',
    required: true,
    xp: 15
  },

  // ── Improvement ─────────────────────────────────────────────────────────
  {
    key: 'improve.feedback',
    stage: 'Improvement',
    prompt: 'What are customers saying?',
    help: 'Top compliments and complaints.',
    type: 'longtext',
    required: true,
    xp: 15
  },
  {
    key: 'improve.units_sold',
    stage: 'Improvement',
    prompt: 'How many units have you sold so far?',
    type: 'number',
    required: true,
    xp: 10
  },
  {
    key: 'improve.next',
    stage: 'Improvement',
    prompt: 'What is the single biggest improvement for the next batch?',
    type: 'longtext',
    required: true,
    xp: 15
  },

  // ── Retired ─────────────────────────────────────────────────────────────
  {
    key: 'retired.reason',
    stage: 'Retired',
    prompt: 'Why is this product being retired?',
    type: 'longtext',
    required: false,
    xp: 10
  }
];

export const QUESTIONS_BY_KEY = new Map(QUESTION_BANK.map((q) => [q.key, q]));

export function questionsForStage(stage: StageId): Question[] {
  return QUESTION_BANK.filter((q) => q.stage === stage && !q.retired);
}

export type AnswerValue = string | number | boolean | string[] | null;

/** True when an answer should count as "answered" (blank strings and empty lists do not). */
export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

/** Normalises and validates an answer for a question. Returns an error message when invalid. */
export function normaliseAnswer(q: Question, raw: unknown): { value: AnswerValue } | { error: string } {
  if (raw === null || raw === undefined || raw === '') return { value: null };
  switch (q.type) {
    case 'text':
    case 'longtext': {
      if (typeof raw !== 'string') return { error: 'Expected text' };
      const max = q.type === 'text' ? 300 : 5000;
      if (raw.length > max) return { error: `Keep it under ${max} characters` };
      return { value: raw.trim() };
    }
    case 'number':
    case 'money': {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) return { error: 'Expected a number' };
      if (n < 0) return { error: 'Must be zero or more' };
      if (n > 1e12) return { error: 'That number is too large' };
      return { value: Math.round(n * 100) / 100 };
    }
    case 'scale': {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) return { error: 'Pick a value from 1 to 5' };
      return { value: n };
    }
    case 'yesno': {
      if (typeof raw !== 'boolean') return { error: 'Expected yes or no' };
      return { value: raw };
    }
    case 'date': {
      if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
        return { error: 'Expected a date (YYYY-MM-DD)' };
      }
      return { value: raw };
    }
    case 'choice': {
      if (typeof raw !== 'string' || !q.options?.includes(raw)) return { error: 'Pick one of the options' };
      return { value: raw };
    }
    case 'multi': {
      if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !q.options?.includes(v))) {
        return { error: 'Pick from the options' };
      }
      return { value: Array.from(new Set(raw as string[])) };
    }
  }
}
