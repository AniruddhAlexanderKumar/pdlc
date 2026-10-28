import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock3,
  Mail,
  MessageSquareText,
  UserRound,
} from "lucide-react";
import type { AccessRequestStatus, AdminAccessRequest } from "@sv/shared";
import { patch } from "../../api/client";
import { useToast } from "../../components/Toast";
import { Button, Select, Textarea } from "../../components/ui";

const STATUS_OPTIONS: { value: AccessRequestStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "reviewing", label: "Reviewing" },
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
    }: {
      id: string;
      status: AccessRequestStatus;
      reviewNote: string;
    }) => patch(`/admin/access-requests/${id}`, { status, reviewNote }),
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
              onSave={(status, reviewNote) =>
                updateRequest.mutate({ id: request.id, status, reviewNote })
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
  onSave: (status: AccessRequestStatus, reviewNote: string) => void;
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
            <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold capitalize text-indigo-700">
              {request.status}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <a
              className="inline-flex items-center gap-1.5 hover:text-indigo-600"
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
              ["Industry", request.industry],
              ["Team size", request.teamSize],
              ["Product stage", request.productStage],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {label}
                </dt>
                <dd className="mt-1 text-sm text-zinc-700">{value}</dd>
              </div>
            ))}
          </dl>

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
              What they want to improve
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
