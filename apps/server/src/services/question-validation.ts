import { isAnswered, type AnswerValue, type Question } from '@sv/shared';
import { money, parse, shortText } from '../lib/http.js';

// Question answers synchronized to product fields must also fit those fields.
// Apply this in both the manual answer endpoint and voice preview/import.
export function validateSyncedQuestionValue(question: Question, value: AnswerValue): void {
  if (!isAnswered(value)) return;
  if (question.syncsTo === 'targetSellingPrice') parse(money, value);
  if (question.syncsTo === 'description') parse(shortText(2000), value);
  if (question.syncsTo === 'category') parse(shortText(60), value);
}
