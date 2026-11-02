import { useCallback, useEffect, useState, type FormEvent } from "react";
import { PublicBrand } from "../components/marketing/PublicBrand";
import { Button, Field, Input } from "../components/ui";

type ReviewData = {
  requiresVerification: false;
  title: string;
  instructions: string;
  projectName: string;
  expiresAt: string | null;
  issues: {
    id: string;
    key: string;
    title: string;
    description: string;
    status: string;
    type: string;
  }[];
  links: { sourceId: string; targetId: string; type: string }[];
};
type Response = ReviewData | { requiresVerification: true };
class ReviewError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function getToken() {
  try {
    const fragment = window.location.hash.slice(1);
    if (/^[A-Za-z0-9_-]{43}$/.test(fragment)) {
      sessionStorage.setItem("sv-review-token", fragment);
      return fragment;
    }
    return sessionStorage.getItem("sv-review-token") || "";
  } catch {
    return window.location.hash.slice(1);
  }
}
function getSession(token: string) {
  try {
    return sessionStorage.getItem(`sv-review-session:${token}`) || "";
  } catch {
    return "";
  }
}
export function ExternalReviewPage() {
  const [token] = useState(getToken);
  const [session, setSession] = useState(() => getSession(token));
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useCallback(
    async <T,>(path: string, method = "GET", body?: unknown): Promise<T> => {
      const headers: Record<string, string> = {
        Authorization: `Review ${token}`,
      };
      if (session) headers["X-Review-Session"] = session;
      if (body !== undefined) headers["content-type"] = "application/json";
      const response = await fetch(`/api/reviewer${path}`, {
        method,
        headers,
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok)
        throw new ReviewError(response.status, payload?.error || "Review is unavailable.");
      return payload as T;
    },
    [token, session],
  );
  const load = useCallback(async () => {
    if (!token) {
      setError("This review link is missing its access token.");
      setLoading(false);
      return;
    }
    try {
      const next = await request<Response>("");
      setData(next);
      setError("");
    } catch (e) {
      setData(null);
      setError(e instanceof ReviewError && e.status === 404 ? "This review is unavailable, expired or has been revoked." : "We couldn’t reach the review right now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [request, token]);
  useEffect(() => {
    if (window.location.hash)
      window.history.replaceState(null, "", window.location.pathname);
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);
  const challenge = async () => {
    setBusy(true);
    setError("");
    try {
      await request("/challenge", "POST", {});
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  };
  const verify = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await request<{ session: string }>("/verify", "POST", {
        code,
      });
      try {
        sessionStorage.setItem(`sv-review-session:${token}`, result.session);
      } catch {
        /* Continue for this page session. */
      }
      setSession(result.session);
      setCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="min-h-full bg-[#f4f8f9] text-[#17384e]">
      <header className="border-b border-[#dbe6ea] bg-white px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <PublicBrand />
          <span className="border border-[#c9dce4] px-3 py-1 text-xs font-semibold text-[#34738f]">
            External review · Read only
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
        {loading && <p className="text-sm text-slate-600">Opening review…</p>}
        {error && (
          <p
            role="alert"
            className="border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        {data?.requiresVerification && (
          <section className="mx-auto max-w-lg border border-[#d9e5e9] bg-white p-6 sm:p-8">
            <p className="text-xs font-bold uppercase tracking-wider text-[#287b9a]">
              Private review
            </p>
            <h1 className="mt-3 text-2xl font-semibold">Verify your email</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              This review is restricted to an email address selected by its
              creator. Request a one-time code; no account is needed.
            </p>
            <Button className="mt-5" onClick={challenge} loading={busy}>
              {sent ? "Send another code" : "Send verification code"}
            </Button>
            {sent && (
              <form onSubmit={verify} className="mt-5 space-y-3">
                <Field
                  label="Six-digit verification code"
                  htmlFor="review-code"
                >
                  <Input
                    id="review-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </Field>
                <Button type="submit" loading={busy}>
                  Open review
                </Button>
              </form>
            )}
          </section>
        )}
        {data && !data.requiresVerification && (
          <>
            <section className="border border-[#d9e5e9] bg-white p-6 sm:p-8">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#287b9a]">
                Review overview
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#102f46]">
                {data.title}
              </h1>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                <span>Project: {data.projectName}</span>
                <span>Status: Active</span>
                <span>
                  Expires:{" "}
                  {data.expiresAt
                    ? new Date(data.expiresAt).toLocaleString()
                    : "No expiry"}
                </span>
              </div>
              {data.instructions && (
                <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                  {data.instructions}
                </p>
              )}
              <p className="mt-6 border-t pt-4 text-xs text-slate-500">
                This is a read-only view of explicitly shared issues. No
                workspace access is granted.
              </p>
            </section>
            <section className="mt-8">
              <h2 className="text-xl font-semibold">Shared project issues</h2>
              <div className="mt-4 grid gap-3">
                {data.issues.map((issue) => (
                  <article
                    id={`issue-${issue.id}`}
                    key={issue.id}
                    className="border border-[#d9e5e9] bg-white p-5 sm:p-6"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[#34738f]">
                      <span>{issue.key}</span>
                      <span>·</span>
                      <span>{issue.type}</span>
                      <span>·</span>
                      <span>{issue.status}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold">
                      {issue.title}
                    </h3>
                    {issue.description && (
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">
                        {issue.description}
                      </p>
                    )}
                    {data.links.filter(
                      (l) => l.sourceId === issue.id || l.targetId === issue.id,
                    ).length > 0 && (
                      <div className="mt-4 border-t pt-3 text-xs text-slate-600">
                        <p className="font-semibold">Shared relationships</p>
                        <ul className="mt-2 space-y-1">
                          {data.links
                            .filter(
                              (l) =>
                                l.sourceId === issue.id ||
                                l.targetId === issue.id,
                            )
                            .map((l, i) => {
                              const other = data.issues.find(
                                (x) =>
                                  x.id ===
                                  (l.sourceId === issue.id
                                    ? l.targetId
                                    : l.sourceId),
                              );
                              return other ? (
                                <li key={i}>
                                  {l.type.replaceAll("_", " ")} ·{" "}
                                  <a
                                    className="font-medium text-blue-700 underline"
                                    href={`#issue-${other.id}`}
                                  >
                                    {other.key}
                                  </a>
                                </li>
                              ) : null;
                            })}
                        </ul>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
