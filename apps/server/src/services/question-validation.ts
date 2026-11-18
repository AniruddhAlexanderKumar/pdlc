import { isAnswered, type AnswerValue, type Question } from '@sv/shared';
import { money, parse, shortText } from '../lib/http.js';

// Question answers synchronized to product fields must also fit those fields.
// Apply this in both the manual answer endpoint and voice preview/import.
export function validateSyncedQuestionValue(question: Question, value: AnswerValue): void {
  if (!isAnswered(value)) return;
  if (question.syncsTo === 'targetSellingPrice' || question.syncsTo === 'overhead') parse(money, value);
  if (question.syncsTo === 'description') parse(shortText(2000), value);
  if (question.syncsTo === 'category') parse(shortText(60), value);
}

/** Shared by manual lessons and reviewed voice imports. Snapshots in the brief
 * remain the founder's answer at the time; these fields feed live costing. */
export function syncedProductFields(question: Question, value: AnswerValue) {
  if (question.syncsTo === 'targetSellingPrice' && typeof value === 'number') return { target_price: value };
  if (question.syncsTo === 'overhead' && typeof value === 'number') return { overhead: value };
  if (question.syncsTo === 'description' && typeof value === 'string') return { description: value };
  if (question.syncsTo === 'category' && typeof value === 'string') return { category: value };
  return null;
}
