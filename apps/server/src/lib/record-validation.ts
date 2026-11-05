import { z } from 'zod';
import { ISSUE_PRIORITIES, ISSUE_STATUSES, ISSUE_TYPES, STAGE_IDS, TASK_STATUSES } from '@sv/shared';
import { money, shortText, url, uuid } from './http.js';

// Shared by manual entry and voice import. Keep mapping-specific restrictions
// (an imported issue must also fit a product task) in the voice validator.
export const productFields = z.object({
  name: shortText(120).min(1, 'Give the product a name'),
  category: shortText(60),
  description: shortText(2000),
  imageUrl: url,
  notes: shortText(10000),
  targetSellingPrice: money.nullable(),
  costs: z.object({ labour: money, packaging: money, overhead: money }).partial(),
  stage: z.enum(STAGE_IDS)
});

export const taskFields = z.object({
  title: shortText(200).min(1, 'Give the task a title'),
  description: shortText(4000),
  status: z.enum(TASK_STATUSES),
  dueDate: z.iso.date().nullable(),
  position: z.number().finite()
});

export const projectKey = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, 'Use 2–10 letters or numbers, starting with a letter');
export const projectInput = z.object({
  key: projectKey,
  name: shortText(120).min(1),
  description: shortText(2000).default('')
});
export const issueInput = z.object({
  type: z.enum(ISSUE_TYPES).default('Task'),
  priority: z.enum(ISSUE_PRIORITIES).default('Medium'),
  summary: shortText(200).min(1),
  description: shortText(5000).default(''),
  labels: z.array(shortText(32).min(1)).max(20).default([]).refine((labels) => new Set(labels).size === labels.length, 'Labels must be unique'),
  assigneeId: uuid.nullable().optional()
});
export const issueStatus = z.enum(ISSUE_STATUSES);
