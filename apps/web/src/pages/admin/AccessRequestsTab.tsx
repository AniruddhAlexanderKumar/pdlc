import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import { BILLING, BILLING_PERIODS, PLAN_CONFIG, PLANS, calculatePricing, recommendedPlan, type PricingPlan, type BillingPeriod, type PricingQuote, type AccessRequestStatus, type AdminAccessRequest, type EducationPricingQuote, type EducationPlan, EDUCATION_CONFIG, EDUCATION_PLANS, calculateEducationPricing } from "@sv/shared";
import { patch } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, Input, Select, Textarea } from "../../components/ui";

const STATUS_OPTIONS: { value: AccessRequestStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "reviewing", label: "Reviewing" },
  { value: "needs_info", label: "Additional information needed" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AccessRequestsTab({
  requests,
  loading,
  error,
  onRetry,
}: {
  requests: AdminAccessRequest[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [filter, setFilter] = useState<"all" | AccessRequestStatus>("all");
  const queryClient = useQueryClient();
  const toast = useToast();

  const updateRequest = useMutation({
    mutationFn: ({
      id,
      status,
      reviewNote,
      pricing,
      educationPricing,
    }: {
      id: string;
      status: AccessRequestStatus;
      reviewNote: string;
      pricing?: Pick<PricingQuote, "plan" | "editors" | "billing">;
      educationPricing?: Pick<EducationPricingQuote, "plan" | "students" | "billing">;
    }) => patch(`/admin/access-requests/${id}`, { status, reviewNote, ...(pricing ? { pricing } : {}), ...(educationPricing ? { educationPricing } : {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-access-requests"] });
      toast.success("Access request updated");
    },
    onError: (requestError) =>
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : "Could not update request",
      ),
  });

  const visibleRequests = useMemo(
    () =>
      filter === "all"
        ? requests
        : requests.filter((request) => request.status === filter),
    [filter, requests],
  );
  const pendingCount = requests.filter(
    (request) => request.status === "pending",
  ).length;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Access requests
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Review incoming requests and record the next step. {pendingCount}{" "}
            pending.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs font-medium text-zinc-500">
          Show
          <Select
            aria-label="Filter access requests by status"
            className="min-w-36"
            value={filter}
            onChange={(event) => {
              const value = event.target.value;
              if (
                value === "all" ||
                STATUS_OPTIONS.some((option) => option.value === value)
              ) {
                setFilter(value as "all" | AccessRequestStatus);
              }
            }}
          >
            <option value="all">All requests</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <p className="rounded-xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs leading-5 text-blue-900">
        Marking a request approved records your review; it does not create an
        account or send an invitation. Use Users Management to provision access
        and contact the requester.
      </p>

      {loading ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          Loading access requests…
        </div>
      ) : error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          <p>{error}</p>
          <Button
            className="mt-3"
            variant="secondary"
            size="sm"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      ) : visibleRequests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
          <UserRound
            className="mx-auto h-8 w-8 text-zinc-400"
            aria-hidden="true"
          />
          <p className="mt-3 text-sm font-medium text-zinc-800">
            {requests.length === 0
              ? "No access requests yet"
              : "No requests match this filter"}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            New requests submitted through the public form will appear here.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {visibleRequests.map((request) => (
            <AccessRequestCard
              key={request.id}
              request={request}
              onSave={(status, reviewNote, pricing, educationPricing) =>
                updateRequest.mutate({ id: request.id, status, reviewNote, pricing, educationPricing })
              }
              saving={updateRequest.isPending}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AccessRequestCard({
  request,
  onSave,
  saving,
}: {
  request: AdminAccessRequest;
  onSave: (status: AccessRequestStatus, reviewNote: string, pricing?: Pick<PricingQuote, "plan" | "editors" | "billing">, educationPricing?: Pick<EducationPricingQuote, "plan" | "students" | "billing">) => void;
  saving: boolean;
}) {
  const [status, setStatus] = useState(request.status);
  const [reviewNote, setReviewNote] = useState(request.reviewNote);

  useEffect(() => {
    setStatus(request.status);
    setReviewNote(request.reviewNote);
  }, [request.reviewNote, request.status]);

  return (
    <article className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">{request.name}</h2>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-blue-700">
              {request.status}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <a
              className="inline-flex items-center gap-1.5 hover:text-blue-600"
              href={`mailto:${request.email}`}
            >
              <Mail className="h-3.5 w-3.5" aria-hidden="true" />
              {request.email}
            </a>
            <span>{request.organization}</span>
            <span>Requested {formatDate(request.createdAt)}</span>
          </div>

          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Role", request.role],
              ["Engineering work", request.industry],
              ...(request.teamSize ? [["Team size", request.teamSize]] : []),
              ...(request.productStage ? [["Product stage", request.productStage]] : []),
              ...(request.country ? [["Country", request.country]] : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {label}
                </dt>
                <dd className="mt-1 text-sm text-zinc-700">{value}</dd>
              </div>
            ))}
          </dl>

          {request.pricingSnapshot && <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50/50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-900">Requested pricing · estimate, not an active subscription</p><dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">{([
            ['Plan', PLAN_CONFIG[request.pricingSnapshot.plan].label], ['Paid editors', String(request.pricingSnapshot.editors)], ['Billing', BILLING[request.pricingSnapshot.billing].label], ['Discount', request.pricingSnapshot.discountPercent === null ? "Custom terms" : `${request.pricingSnapshot.discountPercent}%`],
            ['Regular monthly', request.pricingSnapshot.regularMonthlyCents === null ? 'Custom' : `$${(request.pricingSnapshot.regularMonthlyCents / 100).toFixed(2)}`], ['Billing-period total', request.pricingSnapshot.periodTotalCents === null ? 'Custom' : `$${(request.pricingSnapshot.periodTotalCents / 100).toFixed(2)}`], ['Pricing version', request.pricingSnapshot.version]
          ] as [string,string][]).map(([label,value])=><div key={label}><dt className="text-xs text-zinc-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}</dl></div>}

          {request.proposedPricingSnapshot && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-semibold">Current admin proposal</p><p className="mt-1">{PLAN_CONFIG[request.proposedPricingSnapshot.plan].label} · {request.proposedPricingSnapshot.editors} editors · {BILLING[request.proposedPricingSnapshot.billing].label} · {request.proposedPricingSnapshot.periodTotalCents === null ? 'Custom' : `$${(request.proposedPricingSnapshot.periodTotalCents/100).toFixed(2)} per period`}</p><p className="mt-1 text-xs">Communicate any changes to the applicant before payment. No checkout is available yet.</p></div>}
          {request.educationPricingSnapshot ? <><div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4 text-sm"><p className="font-semibold">Education request · {EDUCATION_CONFIG[request.educationPricingSnapshot.plan].label}</p><p className="mt-2">{request.educationPricingSnapshot.students} student licences · {BILLING[request.educationPricingSnapshot.billing].label} · {request.educationPricingSnapshot.periodTotalCents === null ? 'Custom pricing' : `$${(request.educationPricingSnapshot.periodTotalCents / 100).toFixed(2)} per period`}</p><p className="mt-1">Monthly equivalent: {request.educationPricingSnapshot.effectiveMonthlyCents === null ? 'Custom' : `$${(request.educationPricingSnapshot.effectiveMonthlyCents / 100).toFixed(2)}`}</p>{request.educationDetails && <p className="mt-2 whitespace-pre-wrap text-xs">{request.educationDetails.educationalLevel && `Level: ${request.educationDetails.educationalLevel} · `}{request.educationDetails.teacherCount !== null && `Teachers / mentors: ${request.educationDetails.teacherCount} · `}{request.educationDetails.campuses !== null && `Campuses: ${request.educationDetails.campuses} · `}{request.educationDetails.programmes && `Programmes: ${request.educationDetails.programmes} · `}{request.educationDetails.specialRequirements && `Special requirements: ${request.educationDetails.specialRequirements}`}</p>}</div>{request.proposedEducationPricingSnapshot && <p className="mt-3 text-sm font-semibold">Proposed: {EDUCATION_CONFIG[request.proposedEducationPricingSnapshot.plan].label} · {request.proposedEducationPricingSnapshot.students} students · {request.proposedEducationPricingSnapshot.periodTotalCents === null ? 'Custom' : `$${(request.proposedEducationPricingSnapshot.periodTotalCents/100).toFixed(2)} per period`}</p>}<EducationProposalEditor source={request.proposedEducationPricingSnapshot ?? request.educationPricingSnapshot} saving={saving} onSave={educationPricing=>onSave(status, reviewNote, undefined, educationPricing)} /></> : <ProposalEditor source={request.proposedPricingSnapshot ?? request.pricingSnapshot} saving={saving} onSave={pricing => onSave(status, reviewNote, pricing)} />}

          {request.currentTools && (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                <Clock3 className="h-3.5 w-3.5" aria-hidden="true" /> Current
                tools and process
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                {request.currentTools}
              </p>
            </div>
          )}

          <div className="mt-4">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
              <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />{" "}
              Workflow challenges
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
              {request.goals}
            </p>
          </div>
        </div>

        <div className="w-full space-y-3 lg:max-w-xs">
          <label className="block space-y-1.5 text-xs font-medium text-zinc-600">
            Review status
            <Select
              value={status}
              onChange={(event) => {
                const nextStatus = STATUS_OPTIONS.find(
                  (option) => option.value === event.target.value,
                );
                if (nextStatus) setStatus(nextStatus.value);
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1.5 text-xs font-medium text-zinc-600">
            Internal review note
            <Textarea
              rows={3}
              maxLength={1000}
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="Follow-up or context for the team"
            />
          </label>
          <Button
            size="sm"
            loading={saving}
            onClick={() => onSave(status, reviewNote)}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          >
            Save review
          </Button>
        </div>
      </div>
    </article>
  );
}

function ProposalEditor({source, saving, onSave}: {source: PricingQuote | null; saving: boolean; onSave: (pricing: Pick<PricingQuote, 'plan'|'editors'|'billing'>) => void}) {
  const [plan, setPlan] = useState<PricingPlan>(source?.plan ?? 'individual');
  const [editors, setEditors] = useState(String(source?.editors ?? 1));
  const [billing, setBilling] = useState<BillingPeriod>(source?.billing ?? 'monthly');
  useEffect(()=>{ if(source) {setPlan(source.plan);setEditors(String(source.editors));setBilling(source.billing);} },[source]);
  let quote: PricingQuote | null = null;
  try { if(editors.trim()) quote=calculatePricing(plan,Number(editors),billing); } catch { /* invalid editor count */ }
  return <details className="mt-4 rounded-lg border border-zinc-200 p-3"><summary className="cursor-pointer text-sm font-semibold">Edit proposed subscription</summary><p className="mt-2 text-xs leading-5 text-zinc-500">The original request is preserved. A proposal is an estimate, not activation. Contact the applicant about changes before payment.</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium">Plan<Select value={plan} onChange={e=>{const next=e.target.value as PricingPlan;setPlan(next);const p=PLAN_CONFIG[next];const n=Number(editors);if(!Number.isInteger(n)||n<p.minEditors||n>p.maxEditors)setEditors(String(p.minEditors));}}>{PLANS.map(p=><option key={p} value={p}>{PLAN_CONFIG[p].label}</option>)}</Select></label><label className="text-xs font-medium">Editors<Input type="number" min={1} max={100000} step={1} value={editors} onChange={e=>{setEditors(e.target.value);const n=Number(e.target.value);if(Number.isSafeInteger(n)&&n>=1&&n<=100000)setPlan(recommendedPlan(n));}} /></label><label className="text-xs font-medium">Billing<Select value={billing} onChange={e=>setBilling(e.target.value as BillingPeriod)}>{BILLING_PERIODS.map(p=><option key={p} value={p}>{BILLING[p].label}</option>)}</Select></label></div><p className="mt-3 text-sm">{quote ? `Proposed total per period: ${quote.periodTotalCents === null ? 'Custom' : `$${(quote.periodTotalCents/100).toFixed(2)}`} (${quote.discountPercent === null ? 'custom terms' : `${quote.discountPercent}% discount`})` : 'Enter a valid editor count.'}</p><Button size="sm" className="mt-3" disabled={!quote} loading={saving} onClick={()=>quote&&onSave({plan:quote.plan,editors:quote.editors,billing:quote.billing})}>Save proposal</Button></details>;
}

function EducationProposalEditor({source,saving,onSave}:{source:EducationPricingQuote;saving:boolean;onSave:(q:Pick<EducationPricingQuote,'plan'|'students'|'billing'>)=>void}) {
 const [plan,setPlan]=useState<EducationPlan>(source.plan),[students,setStudents]=useState(String(source.students)),[billing,setBilling]=useState<BillingPeriod>(source.billing);
 useEffect(()=>{setPlan(source.plan);setStudents(String(source.students));setBilling(source.billing)},[source]);let quote:EducationPricingQuote|null=null;try{if(students.trim())quote=calculateEducationPricing(plan,Number(students),billing)}catch{/* invalid */}
 return <details className="mt-4 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold">Edit education proposal</summary><p className="mt-2 text-xs text-zinc-500">Original pricing remains unchanged. Contact the applicant about changes; checkout is not available.</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs">Plan<Select value={plan} onChange={e=>{const p=e.target.value as EducationPlan;setPlan(p);const c=EDUCATION_CONFIG[p];if(Number(students)<c.min||Number(students)>c.max)setStudents(String(p==='education_enterprise'?101:c.min));}}>{EDUCATION_PLANS.map(p=><option key={p} value={p}>{EDUCATION_CONFIG[p].label}</option>)}</Select></label><label className="text-xs">Student licences<Input type="number" min={1} max={100000} value={students} onChange={e=>{setStudents(e.target.value);const n=Number(e.target.value);if(n>100&&n<=100000)setPlan('education_enterprise');else if(n>=10&&n<=100&&plan==='education_enterprise')setPlan('cohort')}} /></label><label className="text-xs">Billing<Select value={billing} onChange={e=>setBilling(e.target.value as BillingPeriod)}>{BILLING_PERIODS.map(p=><option key={p} value={p}>{BILLING[p].label}</option>)}</Select></label></div><p className="mt-3 text-sm">{quote ? `Proposed per period: ${quote.periodTotalCents===null?'Custom':`$${(quote.periodTotalCents/100).toFixed(2)}`}`:'Enter a valid student count.'}</p><Button className="mt-3" size="sm" disabled={!quote} loading={saving} onClick={()=>quote&&onSave({plan:quote.plan,students:quote.students,billing:quote.billing})}>Save education proposal</Button></details>
}
