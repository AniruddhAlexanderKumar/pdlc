import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import {
  ACCESS_REQUEST_INDUSTRIES,
  ACCESS_REQUEST_ROLES,
  ACCESS_REQUEST_TEAM_SIZES,
  BILLING,
  BILLING_PERIODS,
  PLAN_CONFIG,
  PLANS,
  calculatePricing,
  recommendedPlan,
  type BillingPeriod,
  type PricingPlan,
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
const money = (cents: number | null) =>
  cents === null
    ? "Custom"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(cents / 100);
const planDescription: Record<PricingPlan, string> = {
  individual: "For one editor",
  small: "For 2–49 editors",
  medium: "For 50–199 editors",
  enterprise: "For 200+ editors or custom needs",
};
const defaults: Record<PricingPlan, number> = {
  individual: 1,
  small: 2,
  medium: 50,
  enterprise: 200,
};
export function RequestAccessPage() {
  const [searchParams] = useSearchParams();
  const requestedCategory = searchParams.get("category");
  const [category, setCategory] = useState<"commercial" | "education">(() => educationCategoryFromQuery(requestedCategory));
  useEffect(() => { setCategory(educationCategoryFromQuery(requestedCategory)); }, [requestedCategory]);
  const [form, setForm] = useState(initial);
  const [plan, setPlan] = useState<PricingPlan>("individual");
  const [editorsText, setEditorsText] = useState("1");
  const [billing, setBilling] = useState<BillingPeriod>("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const editors = Number(editorsText);
  let quote: ReturnType<typeof calculatePricing> | null = null;
  try {
    if (editorsText.trim()) quote = calculatePricing(plan, editors, billing);
  } catch {
    /* validation shown below */
  }
  const set =
    (key: keyof Form) =>
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((current) => ({ ...current, [key]: event.target.value }));
  const selectPlan = (value: PricingPlan) => {
    setPlan(value);
    const p = PLAN_CONFIG[value];
    if (
      !Number.isInteger(editors) ||
      editors < p.minEditors ||
      editors > p.maxEditors
    )
      setEditorsText(String(defaults[value]));
  };
  const changeEditors = (value: string) => {
    setEditorsText(value);
    const n = Number(value);
    if (value && Number.isSafeInteger(n) && n >= 1 && n <= 100000)
      setPlan(recommendedPlan(n));
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!quote) {
      setError("Enter a valid editor count for your plan.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await post("/access-requests", {
        ...form,
        pricing: { plan, editors, billing },
      });
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
                Your selected plan and billing preferences are attached. Our
                team will review your request and contact you at{" "}
                <span className="font-semibold">{form.email}</span> regarding
                activation.
              </p>
              <p className="mt-3 text-sm text-slate-500">
                No subscription has been activated and no payment has been
                taken.
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
                Request access
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#102f46] sm:text-4xl">
                Get started with Solution Velocity.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
                Tell us about your engineering team, choose the workspace plan
                that fits your organisation and request access to the platform.
              </p>
              <p className="mt-3 text-sm font-medium text-[#315d76]">
                Our team will review your request and contact you.
              </p>
              <fieldset className="mt-7"><legend className="text-sm font-semibold text-[#12394f]">Choose a pricing category</legend><div className="mt-2 flex flex-wrap gap-2">{([['commercial','Commercial'],['education','Education']] as const).map(([value,label]) => <label key={value} className={`cursor-pointer border px-5 py-3 text-sm font-semibold ${category === value ? 'border-[#237b9e] bg-[#eef8fa] text-[#12394f]' : 'border-slate-200 text-slate-600'}`}><input type="radio" name="category" checked={category === value} onChange={() => setCategory(value)} className="mr-2" />{label}</label>)}</div></fieldset>
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
                  aria-labelledby="plan-heading"
                  className="border-t border-slate-200 pt-8"
                >
                  <h2
                    id="plan-heading"
                    className="text-xl font-semibold text-[#12394f]"
                  >
                    Choose your plan
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Estimates in USD. Your request is not a purchase.
                  </p>
                  <div
                    role="radiogroup"
                    aria-labelledby="plan-heading"
                    className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                  >
                    {PLANS.map((id) => {
                      const p = PLAN_CONFIG[id];
                      return (
                        <label
                          key={id}
                          className={`cursor-pointer border p-4 transition-colors ${plan === id ? "border-[#237b9e] bg-[#eef8fa] ring-1 ring-[#237b9e]" : "border-slate-200 bg-white hover:border-slate-400"}`}
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="plan"
                              value={id}
                              checked={plan === id}
                              onChange={() => selectPlan(id)}
                              className="accent-[#176c91]"
                            />
                            <span className="font-semibold text-[#12394f]">
                              {p.label}
                            </span>
                          </span>
                          <span className="mt-3 block text-xs text-slate-600">
                            {planDescription[id]}
                          </span>
                          <span className="mt-3 block text-sm font-semibold">
                            {id === "enterprise"
                              ? "Custom pricing"
                              : id === "individual"
                                ? "$5 / month"
                                : `${money(p.baseCents)} workspace + ${money(p.editorCents)} / editor / month`}
                          </span>
                          <span className="mt-2 block text-xs text-[#34738f]">
                            {BILLING[billing].label}
                            {id === "enterprise" ? " · custom terms" : BILLING[billing].discountPercent
                              ? ` · save ${BILLING[billing].discountPercent}%`
                              : " · no discount"}
                          </span>
                          <span className="mt-3 block text-xs leading-5 text-slate-500">
                            {id === "enterprise"
                              ? "Custom requirements and onboarding, subject to agreement."
                              : "Product and project workspaces, issues and dependency graph."}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-6 max-w-xs">
                    <Field
                      label="Paid editors"
                      htmlFor="request-editors"
                      hint="Changing the count recommends the matching plan; Enterprise also supports custom requirements."
                    >
                      <Input
                        id="request-editors"
                        type="number"
                        min={1}
                        max={100000}
                        step={1}
                        required
                        value={editorsText}
                        onChange={(e) => changeEditors(e.target.value)}
                      />
                    </Field>
                  </div>
                  <fieldset className="mt-7">
                    <legend className="text-sm font-semibold text-[#12394f]">
                      Billing frequency
                    </legend>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {BILLING_PERIODS.map((id) => (
                        <label
                          key={id}
                          className={`flex cursor-pointer items-center gap-2 border px-3 py-3 text-sm ${billing === id ? "border-[#237b9e] bg-[#eef8fa] font-semibold" : "border-slate-200"}`}
                        >
                          <input
                            type="radio"
                            name="billing"
                            value={id}
                            checked={billing === id}
                            onChange={() => setBilling(id)}
                            className="accent-[#176c91]"
                          />
                          {BILLING[id].label}
                          {BILLING[id].discountPercent > 0 && (
                            <span className="text-xs text-teal-700">
                              Save {BILLING[id].discountPercent}%
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <p className="mt-5 text-xs leading-6 text-slate-600">
                    External reviewers are free, require no account, and can
                    view only explicitly shared project issues. Internal
                    read-only seats, editor-seat enforcement, AI allowances and
                    additional credits are not yet available. No unlimited AI
                    usage is included.
                  </p>
                </section>
                <section
                  aria-labelledby="summary-heading"
                  className="border border-[#d1e1e7] bg-[#f6fafb] p-5 sm:p-6"
                >
                  <h2
                    id="summary-heading"
                    className="text-xl font-semibold text-[#12394f]"
                  >
                    Pricing summary
                  </h2>
                  {quote ? (
                    <>
                      <dl className="mt-4 grid gap-x-8 text-sm sm:grid-cols-2">
                        {(
                          [
                            ["Plan", PLAN_CONFIG[quote.plan].label],
                            ["Paid editors", String(quote.editors)],
                            ["Workspace fee / month", money(quote.baseCents)],
                            [
                              "Per-editor fee / month",
                              money(quote.editorCents),
                            ],
                            [
                              "Regular monthly amount",
                              money(quote.regularMonthlyCents),
                            ],
                            ["Billing frequency", BILLING[quote.billing].label],
                            ["Discount", quote.discountPercent === null ? "Custom terms" : `${quote.discountPercent}%`],
                            [
                              "Original billing-period total",
                              money(quote.originalPeriodCents),
                            ],
                            ["Discount amount", money(quote.discountCents)],
                            [
                              "Discounted billing-period total",
                              money(quote.periodTotalCents),
                            ],
                            [
                              "Effective monthly equivalent",
                              money(quote.effectiveMonthlyCents),
                            ],
                          ] as [string, string][]
                        ).map(([k, v]) => (
                          <div
                            key={k}
                            className="flex justify-between gap-4 border-b border-[#dce9ed] py-2"
                          >
                            <dt className="text-slate-600">{k}</dt>
                            <dd className="text-right font-semibold">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-4 font-semibold text-[#12394f]">
                        Expected per billing cycle:{" "}
                        {money(quote.periodTotalCents)}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-slate-600">
                        {plan === "enterprise"
                          ? "Enterprise pricing and discounts are agreed separately; the displayed standard-plan savings do not set enterprise terms."
                          : "Estimate only; the billing-period total is the amount for the full period, not the monthly equivalent. Taxes are not included."}{" "}
                        No charge occurs with this request.
                      </p>
                    </>
                  ) : (
                    <p role="alert" className="mt-4 text-sm text-rose-700">
                      Enter a valid editor count to see an estimate.
                    </p>
                  )}
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
                    Submitting requests review only. No subscription or payment
                    is activated.
                  </p>
                  <Button
                    type="submit"
                    loading={submitting}
                    className="min-h-11 px-6"
                  >
                    Request Access{" "}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </form>}
            </>
          )}
        </div>
        <footer className="mt-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>Solution Velocity · Engineering work, connected.</span>
          <nav aria-label="Footer navigation" className="flex gap-5">
            <Link to="/login" className="hover:text-blue-700">
              Sign in
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
