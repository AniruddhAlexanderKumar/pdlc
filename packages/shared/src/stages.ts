/**
 * The product development lifecycle. Stages are grouped into three phases that
 * mirror the Solution Velocity story: Tell us → Track it → Improve it.
 */

export const PHASES = [
  { id: 'discover', label: 'Tell us', blurb: 'Capture the idea, the customer and the numbers.' },
  { id: 'build', label: 'Track it', blurb: 'Plan, design, prototype and test with costs in view.' },
  { id: 'grow', label: 'Improve it', blurb: 'Launch, learn and make every unit more profitable.' }
] as const;

export type PhaseId = (typeof PHASES)[number]['id'];

export const STAGES = [
  { id: 'Idea', label: 'Idea', phase: 'discover', color: 'zinc', emoji: '💡' },
  { id: 'Research', label: 'Research', phase: 'discover', color: 'sky', emoji: '🔎' },
  { id: 'Planning', label: 'Planning', phase: 'build', color: 'blue', emoji: '🗺️' },
  { id: 'Design', label: 'Design', phase: 'build', color: 'indigo', emoji: '✏️' },
  { id: 'Prototype', label: 'Prototype', phase: 'build', color: 'violet', emoji: '🛠️' },
  { id: 'Testing', label: 'Testing', phase: 'build', color: 'amber', emoji: '🧪' },
  { id: 'Launch', label: 'Launch', phase: 'grow', color: 'emerald', emoji: '🚀' },
  { id: 'Improvement', label: 'Improvement', phase: 'grow', color: 'teal', emoji: '📈' },
  { id: 'Retired', label: 'Retired', phase: 'grow', color: 'rose', emoji: '📦' }
] as const;

export type StageId = (typeof STAGES)[number]['id'];

export const STAGE_IDS = STAGES.map((s) => s.id) as [StageId, ...StageId[]];

export function stageIndex(stage: StageId): number {
  return STAGE_IDS.indexOf(stage);
}

export function nextStage(stage: StageId): StageId | null {
  const i = stageIndex(stage);
  if (i < 0 || i >= STAGE_IDS.length - 2) return null; // Improvement → Retired is never "next"
  return STAGE_IDS[i + 1];
}

export function getStage(stage: string) {
  return STAGES.find((s) => s.id === stage) ?? STAGES[0];
}

export const TASK_STATUSES = ['todo', 'in_progress', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const MATERIAL_UNITS = ['pcs', 'sheet', 'm', 'cm', 'sq.ft', 'kg', 'g', 'L', 'mL', 'set', 'roll'] as const;

export const MATERIAL_CATEGORIES = [
  'Plastics & Acrylics',
  'Metals & Alloys',
  'Electronics',
  'Wood & Timber',
  'Packaging',
  'Fasteners & Hardware',
  'Textiles & Leather',
  'Finishes & Adhesives',
  'Other'
] as const;

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'SGD', 'AED', 'JPY'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const ROLES = ['owner', 'admin', 'member'] as const;
export type Role = (typeof ROLES)[number];
