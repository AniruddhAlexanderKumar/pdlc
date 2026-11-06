import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import type { IssuePage, Project } from "@sv/shared";
import { del, get, patch, post } from "../api/client";
import { useSession } from "../api/hooks";
import { Button, Field, Input, Select, Textarea } from "../components/ui";

type Review = {
  id: string;
  title: string;
  instructions: string;
  projectId: string;
  projectName: string;
  creator: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  emailRestricted: boolean;
  reviewerEmail: string | null;
  showLinks: boolean;
  accessCount: number;
  lastAccessedAt: string | null;
  issueIds: string[];
};
type Settings = { allowUnrestricted: boolean; emailAvailable: boolean };
const date = (s: string | null) =>
  s ? new Date(s).toLocaleString() : "No expiry";
const localInput = (s: string) => {
  const d = new Date(s);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const reviewState = (r: Review) =>
  r.revokedAt
    ? "Revoked"
    : r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now()
      ? "Expired"
      : "Active";
export function ExternalReviewsPage() {
  const me = useSession(),
    [params] = useSearchParams(),
    qc = useQueryClient();
  const permitted = me.workspace.role !== "member" && !me.demo;
  const [projectId, setProjectId] = useState(params.get("project") || "");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [showLinks, setShowLinks] = useState(false);
  const [email, setEmail] = useState("");
  const [expiry, setExpiry] = useState("7");
  const [custom, setCustom] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Review | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<
    { event_type: string; created_at: string }[] | null
  >(null);
  const [historyTitle, setHistoryTitle] = useState("");
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => get<Project[]>("/projects"),
    enabled: permitted,
  });
  const settings = useQuery({
    queryKey: ["review-settings"],
    queryFn: () => get<Settings>("/external-reviews/settings"),
    enabled: permitted,
  });
  const reviews = useQuery({
    queryKey: ["external-reviews"],
    queryFn: () => get<Review[]>("/external-reviews"),
    enabled: permitted,
  });
  const issues = useQuery({
    queryKey: ["review-issues", projectId, offset],
    queryFn: () =>
      get<IssuePage>(
        `/projects/${projectId}/issues?limit=100&offset=${offset}`,
      ),
    enabled: permitted && !!projectId,
  });
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["external-reviews"] });
  const mutate = useMutation({
    mutationFn: async (body: unknown) =>
      editing
        ? patch<{ url?: string }>(`/external-reviews/${editing.id}`, body)
        : post<{ id: string; url: string }>("/external-reviews", body),
    onSuccess: (result) => {
      if (typeof result.url === "string") setUrl(result.url);
      else setUrl("");
      setEditing(null);
      setSelected([]);
      setTitle("");
      setInstructions("");
      setEmail("");
      setError("");
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });
  const updatePolicy = useMutation({
    mutationFn: (allowUnrestricted: boolean) =>
      patch("/external-reviews/settings", { allowUnrestricted }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-settings"] });
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });
  if (!permitted)
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">External Reviews</h1>
        <p className="mt-3 text-sm text-zinc-600">
          Only workspace owners and admins can manage external review links.
          This feature is unavailable in the temporary demo.
        </p>
      </div>
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!projectId || !selected.length) {
      setError("Select a project and at least one issue.");
      return;
    }
    let expiresAt: string | null = null;
    if (expiry === "custom") {
      const t = new Date(custom);
      if (!custom || Number.isNaN(t.getTime())) {
        setError("Choose a valid expiry.");
        return;
      }
      expiresAt = t.toISOString();
    } else if (expiry !== "none")
      expiresAt = new Date(
        Date.now() + Number(expiry) * 86400000,
      ).toISOString();
    mutate.mutate({
      projectId,
      title,
      instructions,
      issueIds: selected,
      expiresAt,
      reviewerEmail: email.trim() || null,
      showLinks,
    });
  };
  const startEdit = (r: Review) => {
    setEditing(r);
    setProjectId(r.projectId);
    setTitle(r.title);
    setInstructions(r.instructions);
    setSelected(r.issueIds);
    setEmail(r.reviewerEmail || "");
    setShowLinks(r.showLinks);
    setExpiry(r.expiresAt ? "custom" : "none");
    setCustom(r.expiresAt ? localInput(r.expiresAt) : "");
    setOffset(0);
    setUrl("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const act = async (action: () => Promise<unknown>) => {
    try {
      await action();
      setError("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update review");
    }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <Link to="/projects" className="text-sm text-blue-700">
          ← Projects
        </Link>
        <h1 className="mt-3 text-2xl font-semibold">External Review Access</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          Share selected project issues in a separate, read-only view. Issue
          descriptions are included: check them for confidential information
          first. Requirements, documents and verification are not yet supported.
        </p>
      </div>
      <Link to="/help/external-review" className="text-sm font-semibold text-blue-700 hover:underline">How external review links work</Link>
      {error && (
        <p
          role="alert"
          className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="font-semibold">Workspace sharing policy</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Unrestricted links can be opened by anyone who receives the link.
          Turning them off immediately revokes existing unrestricted links.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings.data?.allowUnrestricted ?? false}
            disabled={!settings.data || updatePolicy.isPending}
            onChange={(e) => {
              if (
                !e.target.checked &&
                !window.confirm(
                  "Revoke all unrestricted links in this workspace?",
                )
              )
                return;
              updatePolicy.mutate(e.target.checked);
            }}
          />{" "}
          Allow unrestricted links
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          Email verification:{" "}
          {settings.data?.emailAvailable
            ? "configured"
            : "not configured on this server"}
          .
        </p>
        {settings.isError && (
          <p role="alert" className="text-sm text-rose-700">
            Could not load sharing policy.
          </p>
        )}
      </section>
      {url && (
        <section
          className="rounded-lg border border-teal-300 bg-teal-50 p-5"
          role="status"
        >
          <h2 className="font-semibold">Review link created</h2>
          <p className="mt-1 text-sm">
            Copy this link now. For security, it cannot be retrieved again.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              aria-label="New review link"
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="secondary"
              onClick={() =>
                navigator.clipboard
                  .writeText(url)
                  .catch(() =>
                    setError("Select the link and copy it manually."),
                  )
              }
            >
              Copy link
            </Button>
          </div>
        </section>
      )}
      <section className="rounded-lg border bg-white p-5">
        <h2 className="text-lg font-semibold">
          {editing ? "Edit review" : "Create a review link"}
        </h2>
        <form onSubmit={submit} className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Review title" htmlFor="review-title">
              <Input
                id="review-title"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </Field>
            <Field label="Project" htmlFor="review-project">
              <Select
                id="review-project"
                value={projectId}
                disabled={!!editing}
                required
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setSelected([]);
                  setOffset(0);
                }}
              >
                <option value="">Choose a project</option>
                {projects.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.key} · {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Instructions" htmlFor="review-instructions">
            <Textarea
              id="review-instructions"
              maxLength={2000}
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </Field>
          {projectId && (
            <fieldset className="rounded border p-4">
              <legend className="px-1 text-sm font-semibold">
                Choose issues to share ({selected.length} selected)
              </legend>
              <p className="mb-3 text-xs text-zinc-500">
                Only checked issues are exposed, including their descriptions.
                No assignees, labels or internal relationship descriptions are
                shared.
              </p>
              {issues.isLoading && <p>Loading issues…</p>}
              {issues.isError && (
                <p role="alert" className="text-sm text-rose-700">
                  Could not load project issues.
                </p>
              )}
              <div className="max-h-64 space-y-2 overflow-auto">
                {issues.data?.items.map((i) => (
                  <label key={i.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(i.id)}
                      onChange={(e) =>
                        setSelected((v) =>
                          e.target.checked
                            ? [...v, i.id]
                            : v.filter((x) => x !== i.id),
                        )
                      }
                    />
                    <span>
                      {i.key} · {i.summary}
                    </span>
                  </label>
                ))}
              </div>
              {issues.data?.items.length === 0 && (
                <p className="text-sm text-zinc-500">No issues on this page.</p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - 100))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={(issues.data?.items.length ?? 0) < 100}
                  onClick={() => setOffset(offset + 100)}
                >
                  Next
                </Button>
              </div>
            </fieldset>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Expiry" htmlFor="review-expiry">
              <Select
                id="review-expiry"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
              >
                <option value="1">24 hours</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="custom">Custom (within 90 days)</option>
                <option value="none">No expiry (admin only)</option>
              </Select>
            </Field>
            {expiry === "custom" && (
              <Field label="Custom expiry" htmlFor="review-custom">
                <Input
                  id="review-custom"
                  type="datetime-local"
                  required
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                />
              </Field>
            )}
            <Field
              label="Restrict to email (optional)"
              htmlFor="review-email"
              hint={
                editing
                  ? "Cannot be changed after creation."
                  : settings.data?.emailAvailable
                    ? "Reviewer receives a one-time code."
                    : "Requires server email configuration."
              }
            >
              <Input
                id="review-email"
                type="email"
                maxLength={254}
                disabled={!!editing || !settings.data?.emailAvailable}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showLinks}
              onChange={(e) => setShowLinks(e.target.checked)}
            />{" "}
            Show relationships only between selected issues
          </label>
          <p className="text-xs text-zinc-500">
            No document uploads or downloads are available. The reviewer cannot
            access workspace navigation or edit records.
          </p>
          <div className="flex gap-2">
            <Button type="submit" loading={mutate.isPending}>
              {editing ? "Save changes" : "Create link"}
            </Button>
            {editing && (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  setSelected([]);
                  setTitle("");
                  setInstructions("");
                  setEmail("");
                }}
              >
                Cancel editing
              </Button>
            )}
          </div>
        </form>
      </section>
      <section>
        <h2 className="text-lg font-semibold">Existing reviews</h2>
        {reviews.isError && (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            Could not load review links.
          </p>
        )}
        {reviews.isLoading && <p>Loading…</p>}
        <div className="mt-3 grid gap-3">
          {reviews.data?.map((r) => (
            <article key={r.id} className="rounded-lg border bg-white p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{r.title}</h3>
                  <p className="mt-1 text-sm text-zinc-600">
                    {r.projectName} · {reviewState(r)} · Created by{" "}
                    {r.creator || "former member"} on {date(r.createdAt)}
                  </p>
                </div>
                <p className="text-sm">Expiry: {date(r.expiresAt)}</p>
              </div>
              <p className="mt-3 text-xs leading-6 text-zinc-600">
                {r.accessCount} accesses · Last:{" "}
                {r.lastAccessedAt ? date(r.lastAccessedAt) : "Never"} ·{" "}
                {r.emailRestricted ? "Email restricted" : "Unrestricted"} ·
                Downloads unavailable
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!r.revokedAt && (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => startEdit(r)}
                    >
                      Edit / extend
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        if (window.confirm("Revoke this link immediately?"))
                          void act(() =>
                            post(`/external-reviews/${r.id}/revoke`, {}),
                          );
                      }}
                    >
                      Revoke
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      setHistory(await get(`/external-reviews/${r.id}/events`));
                      setHistoryTitle(r.title);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  Access history
                </Button>
                {r.expiresAt &&
                  new Date(r.expiresAt).getTime() <= Date.now() && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (
                          window.confirm("Delete this review and its history?")
                        )
                          void act(() => del(`/external-reviews/${r.id}`));
                      }}
                    >
                      Delete
                    </Button>
                  )}
              </div>
            </article>
          ))}
          {reviews.data?.length === 0 && (
            <p className="text-sm text-zinc-500">No external reviews yet.</p>
          )}
        </div>
      </section>
      {history && (
        <section className="rounded-lg border bg-white p-5">
          <div className="flex justify-between gap-3">
            <h2 className="font-semibold">Access history · {historyTitle}</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setHistory(null)}
            >
              Close
            </Button>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i}>
                {date(h.created_at)} · {h.event_type.replaceAll("_", " ")}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
