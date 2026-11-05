import { z } from 'zod';
import { QUESTIONS_BY_KEY, isAnswered, normaliseAnswer, type VoiceImportPayload } from '@sv/shared';
import { badRequest, money, parse, shortText } from '../lib/http.js';
import { validateSyncedQuestionValue } from './question-validation.js';
import { productFields, taskFields, projectInput, projectKey, issueInput, issueStatus } from '../lib/record-validation.js';

// Match manual product, material, issue and product-task constraints. Both the
// provider draft and the eventual import must pass this same validator.
const schema = z.object({
  product: z.object({
    name: productFields.shape.name,
    category: productFields.shape.category.default('General'), stage: productFields.shape.stage.default('Idea'),
    description: productFields.shape.description.default(''), target_price: productFields.shape.targetSellingPrice.default(null),
    labour: productFields.shape.costs.shape.labour.unwrap().default(0), packaging: productFields.shape.costs.shape.packaging.unwrap().default(0), overhead: productFields.shape.costs.shape.overhead.unwrap().default(0)
  }).strict(),
  answers: z.array(z.object({ question_key: shortText(100).min(1), value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]) }).strict()).max(200).default([]),
  materials: z.array(z.object({ name: shortText(120).min(1), category: shortText(60).default('General'), unit: shortText(20).default('pcs'), unit_price: money.default(0), quantity: z.number().positive().max(1e6).default(1) }).strict()).max(500).default([]),
  project: z.object({ project_key: projectKey, name: projectInput.shape.name, description: projectInput.shape.description }).strict(),
  issues: z.array(z.object({
    type: issueInput.shape.type, status: issueStatus.default('Open'), priority: issueInput.shape.priority,
    summary: issueInput.shape.summary.pipe(taskFields.shape.title), description: issueInput.shape.description.pipe(taskFields.shape.description),
    labels: issueInput.shape.labels,
    milestone_tag: shortText(60).refine(value => value.length === 0, 'Milestone tags cannot be imported; remove this tag and capture it separately').optional()
  }).strict()).max(500).default([])
}).strict();

export function validateVoiceDraft(input: unknown): VoiceImportPayload {
  const draft = parse(schema, input);
  const seen = new Set<string>();
  const answers = draft.answers.map((answer, index) => {
    if (seen.has(answer.question_key)) throw badRequest(`answers.${index}.question_key: Duplicate answer for ${answer.question_key}`);
    seen.add(answer.question_key);
    const question = QUESTIONS_BY_KEY.get(answer.question_key);
    if (!question || question.retired) throw badRequest(`answers.${index}.question_key: Unknown or retired question ${answer.question_key}`);
    const normalised = normaliseAnswer(question, answer.value);
    if ('error' in normalised) throw badRequest(`answers.${index}.value (${answer.question_key}): ${normalised.error}`);
    if (!isAnswered(normalised.value)) throw badRequest(`answers.${index}.value (${answer.question_key}): Answer is empty; remove it or provide a value`);
    // Values synchronized to a product field must satisfy the same product schema.
    validateSyncedQuestionValue(question, normalised.value);
    return { question_key: answer.question_key, value: normalised.value };
  });
  return { ...draft, answers };
}
