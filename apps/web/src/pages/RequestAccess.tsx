import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import {
  ACCESS_REQUEST_INDUSTRIES,
  ACCESS_REQUEST_ROLES,
  ACCESS_REQUEST_TEAM_SIZES,
} from "@sv/shared";
import { ApiError, post } from "../api/client";
import { Button, Field, Input, Select, Textarea } from "../components/ui";
import { PublicBrand } from "../components/marketing/PublicBrand";
import { EducationAccessForm } from "./EducationAccessForm";
import { openCookiePreferences } from "../lib/cookieConsent";
import { educationCategoryFromQuery } from "../lib/marketing/education";

type Form = {
  name: string;
  email: string;
  organization: string;
  role: string;
  industry: string;
  teamSize: string;
  country: string;
  goals: string;
  currentTools: string;
};
const initial: Form = {
  name: "",
  email: "",
  organization: "",
  role: "",
  industry: "",
  teamSize: "",
  country: "",
  goals: "",
  currentTools: "",
};
const selectClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/15";
export function RequestAccessPage() {
  const [searchParams] = useSearchParams();
  const requestedCategory = searchParams.get("category");
  const [category, setCategory] = useState<"commercial" | "education">(() => educationCategoryFromQuery(requestedCategory));
  useEffect(() => { setCategory(educationCategoryFromQuery(requestedCategory)); }, [requestedCategory]);
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const set =
    (key: keyof Form) =>
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      // No pricing selection is collected while pricing is withdrawn from the
      // public site. The API still accepts a priced request from other clients;
      // this form simply does not ask for one.
      await post("/access-requests", form);
      setSubmitted(true);
      window.scrollTo(0, 0);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "We could not submit your request. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <main className="min-h-full bg-[#f4f8f9] px-5 py-10 text-slate-900 sm:px-8 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <PublicBrand />
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-[#315d76] hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to home
          </Link>
        </div>
        <div className="mt-7 border border-[#d9e5e9] bg-white p-6 shadow-[0_24px_70px_-50px_rgba(18,56,78,0.3)] sm:p-10">
          {submitted ? (
            <div className="py-8 text-center" role="status">
              <CheckCircle2
                className="mx-auto h-12 w-12 text-[#26809a]"
                aria-hidden="true"
              />
              <h1 className="mt-5 text-3xl font-semibold tracking-tight text-[#102f46] sm:text-4xl">
                Your access request has been submitted.
              </h1>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-slate-600">
                Your message is with our team, who will reply to{" "}
                <span className="font-semibold">{form.email}</span>.
              </p>
              <p className="mt-3 text-sm text-slate-500">
                You do not need to wait for a reply to use Solution Velocity:
                create your account with{" "}
                <Link to="/signup" className="font-semibold text-blue-700 underline">
                  Get Started
                </Link>
                .
              </p>
              <Link
                to="/"
                className="mt-7 inline-flex min-h-11 items-center gap-2 bg-[#153f5d] px-5 text-sm font-semibold text-white hover:bg-[#0b2d45]"
              >
                Return to home{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#287b9a]">
                Contact
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#102f46] sm:text-4xl">
                Talk to the Solution Velocity team.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Accounts are open — you don’t need to request access. Use this
                form if you would like to discuss your engineering workflow, a
                team or education deployment, or a custom requirement.
              </p>
              <p className="mt-3 text-sm font-medium text-[#315d76]">
                Prefer to start now?{" "}
                <Link to="/signup" className="font-semibold text-blue-700 underline">
                  Get Started
                </Link>{" "}
                and create your workspace in a few minutes.
              </p>
              <fieldset className="mt-7"><legend className="text-sm font-semibold text-[#12394f]">Choose a topic</legend><div className="mt-2 flex flex-wrap gap-2">{([['commercial','Commercial'],['education','Education']] as const).map(([value,label]) => <label key={value} className={`cursor-pointer border px-5 py-3 text-sm font-semibold ${category === value ? 'border-[#237b9e] bg-[#eef8fa] text-[#12394f]' : 'border-slate-200 text-slate-600'}`}><input type="radio" name="category" checked={category === value} onChange={() => setCategory(value)} className="mr-2" />{label}</label>)}</div></fieldset>
              {category === 'education' ? <EducationAccessForm /> : <form onSubmit={submit} className="mt-9 space-y-10">
                <section aria-labelledby="org-heading">
                  <h2
                    id="org-heading"
                    className="text-xl font-semibold text-[#12394f]"
                  >
                    Organisation information
                  </h2>
                  <div className="mt-5 grid gap-5 sm:grid-cols-2">
                    <Field label="Full name" htmlFor="request-name">
                      <Input
                        id="request-name"
                        autoComplete="name"
                        required
                        maxLength={100}
                        value={form.name}
                        onChange={set("name")}
                      />
                    </Field>
                    <Field label="Work email" htmlFor="request-email">
                      <Input
                        id="request-email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        value={form.email}
                        onChange={set("email")}
                      />
                    </Field>
                    <Field
                      label="Organisation name"
                      htmlFor="request-organization"
                    >
                      <Input
                        id="request-organization"
                        autoComplete="organization"
                        required
                        maxLength={120}
                        value={form.organization}
                        onChange={set("organization")}
                      />
                    </Field>
                    <Field label="Job title / role" htmlFor="request-role">
                      <Select
                        id="request-role"
                        required
                        value={form.role}
                        onChange={set("role")}
                        className={selectClass}
                      >
                        <option value="">Choose your role</option>
                        {ACCESS_REQUEST_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Industry" htmlFor="request-industry">
                      <Select
                        id="request-industry"
                        required
                        value={form.industry}
                        onChange={set("industry")}
                        className={selectClass}
                      >
                        <option value="">Choose an area</option>
                        {ACCESS_REQUEST_INDUSTRIES.map((industry) => (
                          <option key={industry} value={industry}>
                            {industry}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Organisation size" htmlFor="request-size">
                      <Select
                        id="request-size"
                        required
                        value={form.teamSize}
                        onChange={set("teamSize")}
                        className={selectClass}
                      >
                        <option value="">Choose size</option>
                        {ACCESS_REQUEST_TEAM_SIZES.filter(
                          (size) => size !== "51+",
                        ).map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Country" htmlFor="request-country">
                      <Input
                        id="request-country"
                        autoComplete="country-name"
                        required
                        maxLength={120}
                        value={form.country}
                        onChange={set("country")}
                      />
                    </Field>
                    <Field
                      label="Current engineering tools (optional)"
                      htmlFor="request-tools"
                    >
                      <Input
                        id="request-tools"
                        maxLength={500}
                        value={form.currentTools}
                        onChange={set("currentTools")}
                      />
                    </Field>
                  </div>
                  <div className="mt-5">
                    <Field
                      label="Primary engineering use case"
                      htmlFor="request-goals"
                    >
                      <Textarea
                        id="request-goals"
                        required
                        minLength={10}
                        maxLength={2000}
                        rows={3}
                        value={form.goals}
                        onChange={set("goals")}
                        placeholder="Tell us what you’d like to improve"
                      />
                    </Field>
                  </div>
                </section>
                <section
                  aria-labelledby="access-heading"
                  className="border-t border-slate-200 pt-8"
                >
                  <h2
                    id="access-heading"
                    className="text-xl font-semibold text-[#12394f]"
                  >
                    Account access
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    During the current launch period you can create an
                    account directly — no request, invitation or payment details
                    are needed. Use{" "}
                    <Link to="/signup" className="font-semibold text-blue-700 underline">
                      Get Started
                    </Link>{" "}
                    to begin now.
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    This form is for pre-sales conversations: custom
                    requirements, procurement and deployment questions. Sending
                    it does not create an account, activate a subscription or
                    take payment.
                  </p>
                </section>
                {error && (
                  <p
                    role="alert"
                    className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                  >
                    {error}
                  </p>
                )}
                <div className="flex flex-col gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-md text-xs leading-5 text-slate-500">
                    Sending this message does not create an account, subscription
                    or payment. For immediate access, use Get Started.
                  </p>
                  <Button
                    type="submit"
                    loading={submitting}
                    className="min-h-11 px-6"
                  >
                    Send message{" "}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </form>}
            </>
          )}
        </div>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>Solution Velocity · Engineering work, connected.</span>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-5">
            <Link to="/signup" className="hover:text-blue-700">
              Get Started
            </Link>
            <Link to="/login" className="hover:text-blue-700">
              Log In
            </Link>
            <Link to="/terms" className="hover:text-blue-700">
              Terms of Service
            </Link>
            <Link to="/privacy" className="hover:text-blue-700">
              Privacy Policy
            </Link>
            <button
              type="button"
              onClick={openCookiePreferences}
              className="hover:text-blue-700"
            >
              Cookie preferences
            </button>
          </nav>
        </footer>
      </div>
    </main>
  );
}
