import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ClipboardList, ExternalLink, Plus, Send, ShieldCheck } from 'lucide-react';
import {
  CONTRIBUTION_DIMENSIONS,
  type Contribution,
  type ContributionDimension,
  type ContributionRatings,
  type Issue,
  type Member,
  type Project
} from '@sv/shared';
import {
  useContributionCategories,
  useContributionRubric,
  useContributionSummary,
  useContributions,
  useCreateContribution,
  useDisputeContribution,
  useEditContribution,
  useManagementContributions,
  useMembers,
  useReviewContribution,
  useResolveContribution,
  useSubmitContribution,
  useVerifyContributionEvidence,
  useWorkspaceData,
  type ContributionSubmissionInput
} from '../api/hooks';
import { get } from '../api/client';
import { Button, Card, CardHeader, EmptyState, Field, Input, Select, Spinner, Textarea, cx } from './ui';

const ratingLabels: Record<ContributionDimension, string> = {
  impact: 'Impact',
  quality: 'Quality',
  complexity: 'Complexity',
  collaboration: 'Collaboration',
  effort: 'Effort and scope'
};

function statusStyle(status: Contribution['status']) {
  if (status === 'approved') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (status === 'rejected') return 'bg-rose-500/10 text-rose-700 dark:text-rose-300';
  if (status === 'submitted' || status === 'disputed') return 'bg-amber-500/10 text-amber-800 dark:text-amber-300';
  return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300';
}

function RatingSelect({
  value,
  onChange,
  label
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)} className="py-1.5">
        <option value="">Select</option>
        {[0, 1, 2, 3, 4, 5].map((rating) => (
          <option key={rating} value={rating}>{rating}/5</option>
        ))}
      </Select>
    </Field>
  );
}

function SubmissionForm({ categories, members, userId }: { categories: NonNullable<ReturnType<typeof useContributionCategories>['data']>; members: Member[]; userId: string }) {
  const [categoryKey, setCategoryKey] = useState(categories[0]?.key ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [outcome, setOutcome] = useState('');
  const [expectedImpact, setExpectedImpact] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceDescription, setEvidenceDescription] = useState('');
  const [projectId, setProjectId] = useState('');
  const [productId, setProductId] = useState('');
  const [participants, setParticipants] = useState([{ userId, roleDescription: 'Primary contributor', contributionDescription: '', attributionShare: 100 }]);
  const [formError, setFormError] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const workspace = useWorkspaceData();
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: () => get<Project[]>('/projects') });
  const issuesQuery = useQuery({
    queryKey: ['contribution-issues', projectId],
    queryFn: () => get<{ items: Issue[] }>(`/projects/${projectId}/issues?limit=100`),
    enabled: Boolean(projectId)
  });
  const [issueId, setIssueId] = useState('');
  const [taskId, setTaskId] = useState('');
  const create = useCreateContribution();
  const submit = useSubmitContribution();

  const addParticipant = (newUserId: string) => {
    if (!newUserId || participants.some((participant) => participant.userId === newUserId)) return;
    const equalShare = Math.floor(100 / (participants.length + 1));
    setParticipants((current) => [
      ...current.map((participant, index) => ({ ...participant, attributionShare: index === 0 ? 100 - equalShare * current.length : equalShare })),
      { userId: newUserId, roleDescription: '', contributionDescription: '', attributionShare: equalShare }
    ]);
  };
  const selectedMemberIds = new Set(participants.map((participant) => participant.userId));
  const selectedProduct = workspace.data?.products.find((product) => product.id === productId);
  useEffect(() => {
    if (!categoryKey && categories[0]) setCategoryKey(categories[0].key);
  }, [categories, categoryKey]);

  const reset = () => {
    setTitle('');
    setDescription('');
    setOutcome('');
    setExpectedImpact('');
    setEvidenceUrl('');
    setEvidenceDescription('');
    setProjectId('');
    setProductId('');
    setIssueId('');
    setTaskId('');
    setParticipants([{ userId, roleDescription: 'Primary contributor', contributionDescription: '', attributionShare: 100 }]);
    setFormError('');
  };
  const saveContribution = async (submitForReview: boolean) => {
    if (!formRef.current?.reportValidity()) return;
    setFormError('');
    if (participants.reduce((sum, participant) => sum + participant.attributionShare, 0) !== 100) {
      setFormError('Contributor attribution shares must add up to 100%.');
      return;
    }
    if (participants.some((participant) => !participant.roleDescription.trim() || !participant.contributionDescription.trim())) {
      setFormError('Describe each contributor’s role and individual work.');
      return;
    }
    const body: ContributionSubmissionInput = {
      idempotencyKey: crypto.randomUUID(),
      categoryKey,
      title,
      description,
      outcome,
      expectedImpact,
      projectId: projectId || null,
      productId: productId || null,
      issueId: issueId || null,
      taskId: taskId || null,
      participants,
      evidence: [{ sourceType: 'url', url: evidenceUrl, description: evidenceDescription }]
    };
    try {
      const contribution = await create.mutateAsync(body);
      if (submitForReview) await submit.mutateAsync(contribution.id);
      reset();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The contribution could not be submitted.');
    }
  };
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void saveContribution(true);
  };

  return (
    <Card>
      <CardHeader icon={<Plus className="h-4 w-4" />} title="Submit a contribution" subtitle="Describe an outcome and evidence; a workspace reviewer assesses it before it earns Contribution XP." />
      <form ref={formRef} className="space-y-4 p-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <Select value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)} required>
              {categories.map((category) => <option key={category.key} value={category.key}>{category.name}</option>)}
            </Select>
          </Field>
          <Field label="Contribution title">
            <Input required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What changed or was learned?" />
          </Field>
        </div>
        <Field label="Work performed">
          <Textarea required maxLength={10000} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the work and its scope." />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Outcome">
            <Textarea maxLength={5000} value={outcome} onChange={(event) => setOutcome(event.target.value)} placeholder="What was delivered, accepted, or learned?" />
          </Field>
          <Field label="Expected or demonstrated impact">
            <Textarea maxLength={5000} value={expectedImpact} onChange={(event) => setExpectedImpact(event.target.value)} placeholder="Explain the value, risk reduced, or learning enabled." />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Related project">
            <Select value={projectId} onChange={(event) => { setProjectId(event.target.value); setIssueId(''); }}>
              <option value="">No project selected</option>
              {(projectsQuery.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.key} · {project.name}</option>)}
            </Select>
          </Field>
          {projectId && (
            <Field label="Related issue">
              <Select value={issueId} onChange={(event) => setIssueId(event.target.value)}>
                <option value="">No issue selected</option>
                {(issuesQuery.data?.items ?? []).map((issue) => <option key={issue.id} value={issue.id}>{issue.key} · {issue.summary}</option>)}
              </Select>
            </Field>
          )}
          <Field label="Related product">
            <Select value={productId} onChange={(event) => { setProductId(event.target.value); setTaskId(''); }}>
              <option value="">No product selected</option>
              {(workspace.data?.products ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </Select>
          </Field>
          {selectedProduct && selectedProduct.tasks.length > 0 && (
            <Field label="Related product task">
              <Select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                <option value="">No task selected</option>
                {selectedProduct.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
              </Select>
            </Field>
          )}
        </div>
        <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Contributors and attribution</p>
              <p className="text-xs text-zinc-500">Each person is assessed separately. Shares must total 100%.</p>
            </div>
            <Select aria-label="Add contributor" className="max-w-56" value="" onChange={(event) => addParticipant(event.target.value)}>
              <option value="">Add workspace member</option>
              {members.filter((member) => !selectedMemberIds.has(member.userId)).map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
            </Select>
          </div>
          <div className="space-y-3">
            {participants.map((participant, index) => {
              const member = members.find((item) => item.userId === participant.userId);
              return (
                <div key={participant.userId} className="grid gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-4 dark:border-zinc-800">
                  <p className="self-center text-sm font-medium">{member?.name ?? 'You'}</p>
                  <Input aria-label={`${member?.name ?? 'Contributor'} role`} required value={participant.roleDescription} onChange={(event) => setParticipants((current) => current.map((p, i) => i === index ? { ...p, roleDescription: event.target.value } : p))} placeholder="Role on this work" />
                  <Input aria-label={`${member?.name ?? 'Contributor'} contribution`} required value={participant.contributionDescription} onChange={(event) => setParticipants((current) => current.map((p, i) => i === index ? { ...p, contributionDescription: event.target.value } : p))} placeholder="Individual contribution" />
                  <Field label="Share (%)">
                    <Input type="number" min={1} max={100} required value={participant.attributionShare} onChange={(event) => setParticipants((current) => current.map((p, i) => i === index ? { ...p, attributionShare: Number(event.target.value) } : p))} />
                  </Field>
                </div>
              );
            })}
            <p className="text-right text-xs text-zinc-500">Total attribution: {participants.reduce((sum, participant) => sum + participant.attributionShare, 0)}%</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Evidence URL" hint="Use an internal project/issue reference above or a link reviewers can inspect.">
            <Input type="url" required value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="https://…" />
          </Field>
          <Field label="Evidence description">
            <Input required maxLength={2000} value={evidenceDescription} onChange={(event) => setEvidenceDescription(event.target.value)} placeholder="What does this link support?" />
          </Field>
        </div>
        {formError && <p className="text-sm text-rose-600" role="alert">{formError}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" disabled={create.isPending || submit.isPending} onClick={() => void saveContribution(false)}>Save draft</Button>
          <Button type="submit" loading={create.isPending || submit.isPending} icon={<Send className="h-4 w-4" />}>Submit for review</Button>
        </div>
      </form>
    </Card>
  );
}

function ScoreForm({ contribution, resolve = false }: { contribution: Contribution; resolve?: boolean }) {
  const [decision, setDecision] = useState<'approved' | 'revision_requested' | 'rejected'>('approved');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [scores, setScores] = useState<Record<string, { ratings: Record<ContributionDimension, string>; explanation: string }>>({});
  const review = useReviewContribution();
  const resolveDispute = useResolveContribution();
  const setRating = (userId: string, dimension: ContributionDimension, value: string) => {
    setScores((current) => {
      const previous = current[userId];
      return {
        ...current,
        [userId]: {
          ratings: {
            impact: dimension === 'impact' ? value : previous?.ratings.impact ?? '',
            quality: dimension === 'quality' ? value : previous?.ratings.quality ?? '',
            complexity: dimension === 'complexity' ? value : previous?.ratings.complexity ?? '',
            collaboration: dimension === 'collaboration' ? value : previous?.ratings.collaboration ?? '',
            effort: dimension === 'effort' ? value : previous?.ratings.effort ?? ''
          },
          explanation: previous?.explanation ?? ''
        }
      };
    });
  };
  const handleReview = async () => {
    setFormError('');
    const scoreInputs = decision === 'approved' ? contribution.participants.map((participant) => ({
      userId: participant.userId!,
      ratings: Object.fromEntries(CONTRIBUTION_DIMENSIONS.map((dimension) => [
        dimension,
        contribution.category.applicableDimensions.includes(dimension)
          ? Number(scores[participant.userId!]?.ratings[dimension])
          : null
      ])) as ContributionRatings,
      explanation: scores[participant.userId!]?.explanation ?? ''
    })) : undefined;
    const payload = { id: contribution.id, decision, notes, ...(scoreInputs ? { scores: scoreInputs } : {}) };
    try {
      if (resolve) await resolveDispute.mutateAsync(payload);
      else await review.mutateAsync(payload);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Review could not be recorded.');
    }
  };
  const busy = review.isPending || resolveDispute.isPending;
  const invalidScores = decision === 'approved' && contribution.participants.some((participant) => {
    const row = scores[participant.userId ?? ''];
    return !participant.userId || contribution.category.applicableDimensions.some((dimension) => !row?.ratings[dimension]) || !row?.explanation?.trim();
  });
  const eligible = contribution.participants.every((participant) => participant.userId);

  return (
    <div className="mt-4 space-y-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-900">
      {decision === 'approved' && contribution.participants.map((participant) => {
        const userId = participant.userId!;
        const scoresForUser = scores[userId] ?? { ratings: { impact: '', quality: '', complexity: '', collaboration: '', effort: '' }, explanation: '' };
        return (
          <div key={userId} className="space-y-2 border-b border-zinc-200 pb-3 last:border-0 dark:border-zinc-700">
            <p className="text-sm font-semibold">{participant.name} · {participant.attributionShare}% attribution</p>
            <div className="grid gap-2 sm:grid-cols-5">
              {CONTRIBUTION_DIMENSIONS.filter((dimension) => contribution.category.applicableDimensions.includes(dimension)).map((dimension) => (
                <RatingSelect key={dimension} label={ratingLabels[dimension]} value={scoresForUser.ratings[dimension]} onChange={(value) => setRating(userId, dimension, value)} />
              ))}
            </div>
            <Textarea aria-label={`Score explanation for ${participant.name}`} required value={scoresForUser.explanation} onChange={(event) => setScores((current) => ({
              ...current,
              [userId]: { ratings: scoresForUser.ratings, explanation: event.target.value }
            }))} placeholder="Explain the evidence, dimension ratings, and individual award." />
          </div>
        );
      })}
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <Field label="Review decision">
          <Select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}>
            <option value="approved">Approve</option>
            <option value="revision_requested">Request changes</option>
            <option value="rejected">Reject</option>
          </Select>
        </Field>
        <Field label="Reviewer notes">
          <Textarea required value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Record the decision and feedback." />
        </Field>
      </div>
      {!eligible && <p className="text-sm text-rose-600">A contributor account was removed; attribution must be corrected before approval.</p>}
      {formError && <p className="text-sm text-rose-600" role="alert">{formError}</p>}
      <div className="flex justify-end">
        <Button size="sm" disabled={!notes.trim() || (decision === 'approved' && (invalidScores || !eligible))} loading={busy} onClick={() => void handleReview()}>
          Record review
        </Button>
      </div>
    </div>
  );
}

function ContributionCard({ contribution, isManager, userId }: { contribution: Contribution; isManager: boolean; userId: string }) {
  const [disputeReason, setDisputeReason] = useState('');
  const [revisionTitle, setRevisionTitle] = useState(contribution.title);
  const [revisionText, setRevisionText] = useState(contribution.description);
  const [revisionOutcome, setRevisionOutcome] = useState(contribution.outcome);
  const [revisionImpact, setRevisionImpact] = useState(contribution.expectedImpact);
  const dispute = useDisputeContribution();
  const edit = useEditContribution();
  const submit = useSubmitContribution();
  const verify = useVerifyContributionEvidence();
  const isContributor = contribution.participants.some((participant) => participant.userId === userId);
  const canDispute = isContributor && ['approved', 'rejected'].includes(contribution.status);
  const canReview = isManager && contribution.status === 'submitted' && !isContributor;
  const canResolve = isManager && contribution.status === 'disputed' && !isContributor;

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{contribution.title}</h3>
            <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', statusStyle(contribution.status))}>{contribution.status.replace('_', ' ')}</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">{contribution.category.name} · {new Date(contribution.createdAt).toLocaleDateString()}</p>
        </div>
        <div className="text-right">
          {contribution.participants.filter((participant) => participant.userId === userId).map((participant) => participant.awardedXp !== null && (
            <p key={participant.userId} className="font-semibold tabular-nums">{participant.awardedXp} Contribution XP</p>
          ))}
          {contribution.projectId && <p className="text-xs text-zinc-500">Linked project work</p>}
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{contribution.description}</p>
      {contribution.outcome && <p className="mt-2 text-sm"><span className="font-medium">Outcome:</span> {contribution.outcome}</p>}
      {contribution.expectedImpact && <p className="mt-1 text-sm"><span className="font-medium">Impact:</span> {contribution.expectedImpact}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {contribution.participants.map((participant) => (
          <div key={participant.userId ?? participant.roleDescription} className="rounded-lg border border-zinc-100 p-3 text-xs dark:border-zinc-800">
            <p className="font-semibold">{participant.name ?? 'Former workspace member'} · {participant.attributionShare}%</p>
            <p className="mt-1">{participant.roleDescription}: {participant.contributionDescription}</p>
            {participant.score !== null && (
              <>
                <p className="mt-1 font-medium">{participant.score}/100 score · {participant.awardedXp} Contribution XP</p>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-zinc-500">
                  {CONTRIBUTION_DIMENSIONS.map((dimension) => participant.ratings?.[dimension] !== null && participant.ratings?.[dimension] !== undefined && (
                    <span key={dimension}>{ratingLabels[dimension]} {participant.ratings[dimension]}/5</span>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {contribution.evidence.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Evidence</p>
          {contribution.evidence.map((evidence) => (
            <div key={evidence.id} className="flex flex-wrap items-center gap-2 text-xs">
              {evidence.url ? <a href={evidence.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 underline dark:text-indigo-400"><ExternalLink className="h-3 w-3" />{evidence.description}</a> : <span>{evidence.description}</span>}
              {evidence.verifiedAt ? <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck className="h-3 w-3" />Verified</span> : isManager && contribution.status !== 'approved' && contribution.status !== 'rejected' && evidence.participantId !== userId && (
                <Button size="sm" variant="ghost" loading={verify.isPending} onClick={() => verify.mutate({ id: contribution.id, evidenceId: evidence.id })}>Verify evidence</Button>
              )}
            </div>
          ))}
        </div>
      )}
      {contribution.reviews.length > 0 && (
        <div className="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Review history</p>
          <ul className="mt-2 space-y-2">
            {contribution.reviews.map((review) => (
              <li key={review.id} className="text-xs text-zinc-600 dark:text-zinc-400">
                <span className="font-medium">{review.reviewerName ?? 'Workspace reviewer'}</span> · {review.decision.replace('_', ' ')} · {new Date(review.createdAt).toLocaleString()}
                {review.notes && <p className="mt-0.5">{review.notes}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {canDispute && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <Input aria-label="Correction or dispute reason" value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} placeholder="Request a correction or dispute this decision" />
          <Button size="sm" variant="secondary" disabled={!disputeReason.trim()} loading={dispute.isPending} onClick={() => dispute.mutate({ id: contribution.id, reason: disputeReason })}>Request correction</Button>
        </div>
      )}
      {contribution.submittedBy === userId && ['draft', 'revision_requested'].includes(contribution.status) && (
        <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-300" htmlFor={`revise-${contribution.id}`}>Edit draft or revise using reviewer feedback</label>
          <Input aria-label="Contribution title" value={revisionTitle} onChange={(event) => setRevisionTitle(event.target.value)} />
          <Textarea id={`revise-${contribution.id}`} aria-label="Work performed" value={revisionText} onChange={(event) => setRevisionText(event.target.value)} />
          <Textarea aria-label="Outcome" value={revisionOutcome} onChange={(event) => setRevisionOutcome(event.target.value)} placeholder="Outcome" />
          <Textarea aria-label="Expected or demonstrated impact" value={revisionImpact} onChange={(event) => setRevisionImpact(event.target.value)} placeholder="Expected or demonstrated impact" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" loading={edit.isPending} onClick={() => edit.mutate({
              id: contribution.id,
              title: revisionTitle,
              description: revisionText,
              outcome: revisionOutcome,
              expectedImpact: revisionImpact
            })}>Save changes</Button>
            <Button size="sm" loading={submit.isPending} onClick={() => submit.mutate(contribution.id)}>{contribution.status === 'draft' ? 'Submit for review' : 'Resubmit'}</Button>
          </div>
        </div>
      )}
      {canReview && <ScoreForm contribution={contribution} />}
      {canResolve && <ScoreForm contribution={contribution} resolve />}
      {isManager && (contribution.status === 'submitted' || contribution.status === 'disputed') && isContributor && (
        <p className="mt-3 text-xs text-zinc-500">You are listed as a contributor; backend policy prevents self-review.</p>
      )}
    </Card>
  );
}

export function ContributionCenter({ isManager, userId }: { isManager: boolean; userId: string }) {
  const [days, setDays] = useState(90);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const categories = useContributionCategories();
  const rubric = useContributionRubric();
  const own = useContributions();
  const summary = useContributionSummary(days, !isManager);
  const members = useMembers();
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => get<Project[]>('/projects') });
  const managerRows = useManagementContributions({
    userId: employeeFilter || undefined,
    projectId: projectFilter || undefined,
    category: categoryFilter || undefined,
    status: statusFilter || undefined,
    from: from || undefined,
    to: to || undefined
  }, isManager);
  const visible = isManager ? managerRows : own;
  const recordList = useMemo(() => visible.data ?? [], [visible.data]);

  return (
    <section className="space-y-5 px-4 pb-6 md:px-6">
      {!isManager && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium text-zinc-500">Approved Contribution XP</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{summary.data?.approvedXp.toLocaleString() ?? '—'}</p>
          <p className="mt-1 text-xs text-zinc-500">Separate from Legacy Activity XP</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-zinc-500">Approved contributions</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{summary.data?.approvedCount ?? '—'}</p>
          <p className="mt-1 text-xs text-zinc-500">Reviewed outcomes attributed to you</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-zinc-500">Awaiting review</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums">{summary.data?.pendingCount ?? '—'}</p>
          <p className="mt-1 text-xs text-zinc-500">Submitted, disputed, or returned records</p>
        </Card>
        <Card className="p-4">
          <Field label="Trend period">
            <Select value={days} onChange={(event) => setDays(Number(event.target.value))}>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={365}>Last 12 months</option>
            </Select>
          </Field>
          <div className="mt-2 flex h-5 items-end gap-1" aria-label="Contribution XP by day">
            {(summary.data?.trend ?? []).slice(-30).map((item) => {
              const max = Math.max(1, ...(summary.data?.trend ?? []).map((trend) => trend.xp));
              return <span key={item.date} title={`${item.date}: ${item.xp} XP`} className="min-w-1 flex-1 rounded-t bg-indigo-500/70" style={{ height: `${Math.max(3, (Math.max(0, item.xp) / max) * 100)}%` }} />;
            })}
            {(summary.data?.trend.length ?? 0) === 0 && <span className="text-xs text-zinc-400">No approved awards in this period</span>}
          </div>
        </Card>
      </div>
      {summary.data?.byCategory.length ? (
        <Card>
          <CardHeader icon={<ClipboardList className="h-4 w-4" />} title="Approved contribution by category" subtitle="Earned Contribution XP, not an employee ranking." />
          <div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {summary.data.byCategory.map((category) => (
              <div key={category.key} className="flex justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60">
                <span>{category.name} <span className="text-xs text-zinc-400">({category.count})</span></span>
                <span className="font-semibold tabular-nums">{category.xp} XP</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      {summary.isError && <p role="alert" className="text-sm text-rose-600">Contribution summary could not be loaded.</p>}
      </>}
      {rubric.data && (
        <Card>
          <CardHeader
            icon={<ShieldCheck className="h-4 w-4" />}
            title={`Contribution scoring · ${rubric.data.version}`}
            subtitle="Reviewers rate evidenced outcomes from 0–5. Applicable dimension weights are normalized; the weighted score is rounded to Contribution XP and allocated by attribution share."
          />
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
            {CONTRIBUTION_DIMENSIONS.map((dimension) => (
              <div key={dimension} className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800/60">
                <p className="text-sm font-medium">{ratingLabels[dimension]}</p>
                <p className="mt-1 text-xs text-zinc-500">{rubric.data.weights[dimension]}% baseline weight</p>
                <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">{rubric.data.scale[dimension][0]} → {rubric.data.scale[dimension][5]}</p>
              </div>
            ))}
          </div>
          <p className="px-4 pb-4 text-xs text-zinc-500">Each score is recorded with its rubric version and explanation. Ratings are not inferred from commits, time online, or task counts.</p>
        </Card>
      )}
      {categories.isError && <p role="alert" className="text-sm text-rose-600">Contribution categories could not be loaded.</p>}
      {rubric.isError && <p role="alert" className="text-sm text-rose-600">Contribution scoring rubric could not be loaded.</p>}
      {!isManager && categories.data && members.data && <SubmissionForm categories={categories.data} members={members.data} userId={userId} />}
      {isManager && (
        <Card>
          <CardHeader icon={<ClipboardList className="h-4 w-4" />} title="Team contribution review" subtitle="Workspace-scoped records; context and evidence matter more than totals." />
          <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Employee">
              <Select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}>
                <option value="">All employees</option>
                {(members.data ?? []).map((member) => <option key={member.userId} value={member.userId}>{member.name}</option>)}
              </Select>
            </Field>
            <Field label="Project">
              <Select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
                <option value="">All projects</option>
                {(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.key} · {project.name}</option>)}
              </Select>
            </Field>
            <Field label="Category">
              <Select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                <option value="">All categories</option>
                {(categories.data ?? []).map((category) => <option key={category.key} value={category.key}>{category.name}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="">All statuses</option>
                {['submitted', 'revision_requested', 'approved', 'rejected', 'disputed'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
              </Select>
            </Field>
            <Field label="From date"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
            <Field label="To date"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          </div>
        </Card>
      )}
      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">{isManager ? 'Contribution records' : 'Your contribution history'}</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Legacy Activity XP remains in the existing achievements panel above.</p>
          </div>
          <span className="text-xs text-zinc-500">Scores use rubric {categories.data ? 'configured for this workspace' : '…'}; evidence supports review, not automatic scoring.</span>
        </div>
        {visible.isLoading ? <Spinner label="Loading contributions" /> : visible.isError ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">Contribution data could not be loaded. Refresh and try again.</div>
        ) : recordList.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No contribution records yet" body={isManager ? 'Submitted contributions and filters will appear here.' : 'Submit an evidence-backed contribution when you have work to document.'} />
        ) : recordList.map((contribution) => (
          <ContributionCard key={contribution.id} contribution={contribution} isManager={isManager} userId={userId} />
        ))}
      </div>
    </section>
  );
}
