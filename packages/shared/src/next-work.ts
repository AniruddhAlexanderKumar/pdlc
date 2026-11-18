import { activityHref, CHAPTER_BRIEFS, type Journey } from './journey.js';
import { QUESTIONS_BY_KEY } from './questions.js';
import type { Recommendation } from './recommendations.js';
import type { ActivityDraft, Product } from './types.js';

/** Used by the dashboard, product page and copilot. Links inspect work; only a
 * separate explicit stage mutation moves the product's lifecycle position. */
export function nextWork(
  product: Product,
  journey: Journey,
  recommendations: Recommendation[],
  drafts: ActivityDraft[] = []
) {
  const root = `/products/${product.id}`;
  const stage = journey.current;
  const plan = (title: string, reason: string, href: string, action: string) => ({ title, reason, href, action });
  if (product.stage === 'Retired')
    return plan(
      'Review the archive note',
      'This product is retired. Your work is still here.',
      `${root}/discover?stage=Retired`,
      'View record'
    );
  for (const d of drafts) {
    const q = QUESTIONS_BY_KEY.get(d.questionKey);
    if (d.productId === product.id && q && !q.retired)
      return plan(
        q.prompt,
        'Your private draft is ready where you left it.',
        `${root}/discover?stage=${q.stage}&q=${q.key}`,
        'Resume draft'
      );
  }
  const urgent = recommendations.find((r) => r.priority < 6);
  if (urgent) {
    const target = urgent.activityKey.startsWith('task:')
      ? `${root}/tasks`
      : `${root}/journey?stage=${urgent.stage}&activity=${encodeURIComponent(urgent.activityKey)}`;
    return plan(urgent.label, urgent.because, target, 'Review next step');
  }
  if (stage.complete) {
    if (stage.id === 'Improvement')
      return plan(
        'Plan the next iteration',
        'Use your feedback to revisit the earliest chapter that needs a change.',
        `${root}/journey?stage=Improvement`,
        'Open iteration brief'
      );
    if (journey.nextStageId)
      return plan(
        `Continue to ${journey.nextStageId}`,
        `Your ${CHAPTER_BRIEFS[stage.id].toLowerCase()} is ready to review.`,
        `${root}/journey?stage=${stage.id}`,
        'Review milestone'
      );
  }
  const pending = stage.pendingApproval?.[0];
  if (pending)
    return plan(
      `Review: ${QUESTIONS_BY_KEY.get(pending)?.output ?? pending}`,
      'A chapter decision needs sign-off before moving on.',
      `${root}/journey?stage=${stage.id}&activity=${pending}`,
      'Open review'
    );
  const next = journey.nextActivity;
  return next
    ? plan(
        next.activity.label,
        next.activity.why,
        activityHref(product.id, next.stage, next.activity),
        'Continue building'
      )
    : plan('Review your chapter', stage.guide.purpose, `${root}/journey`, 'View journey');
}
