import { useState, type ChangeEvent, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router";
import {
  ACCESS_REQUEST_INDUSTRIES,
  ACCESS_REQUEST_ROLES,
  ACCESS_REQUEST_STAGES,
  ACCESS_REQUEST_TEAM_SIZES,
} from "@sv/shared";
import { ApiError, post } from "../api/client";
import { Button, Field, Input, Select, Textarea } from "../components/ui";

interface RequestForm {
  name: string;
  email: string;
  organization: string;
  role: string;
  industry: string;
  teamSize: string;
  productStage: string;
  currentTools: string;
  goals: string;
}

const INITIAL_FORM: RequestForm = {
  name: "",
  email: "",
  organization: "",
  role: "",
  industry: "",
  teamSize: "",
  productStage: "",
  currentTools: "",
  goals: "",
};

const selectClass =
  "w-full rounded-lg border border-blue-100 bg-white px-3 py-2.5 text-sm text-[#17365e] transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15";

export function RequestAccessPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const set =
    (key: keyof RequestForm) =>
    (
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setForm((current) => ({ ...current, [key]: event.target.value }));
    };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await post("/access-requests", form);
      setSubmitted(true);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : "We could not submit your request. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-full bg-gradient-to-br from-white via-[#f2f8ff] to-[#e6f2ff] px-5 py-10 text-[#17365e] sm:px-8 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#31577d] transition-colors hover:text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Solution Velocity
        </Link>

        <div className="mt-7 rounded-[2rem] border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/80 p-6 shadow-[0_28px_72px_-48px_rgba(30,64,110,0.38)] sm:p-10">
          {submitted ? (
            <div className="py-8 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </span>
              <h1 className="mt-5 font-serif text-3xl text-[#102f55] sm:text-4xl">
                Thanks for reaching out.
              </h1>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#526b88]">
                Your request is with our team. We’ll review your product, team,
                and goals and follow up at{" "}
                <span className="font-medium text-[#17365e]">{form.email}</span>
                .
              </p>
              <Link
                to="/"
                className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-gradient-to-r from-[#123c70] to-[#168ac2] px-5 py-2.5 text-sm font-medium text-white transition-all hover:brightness-110"
              >
                Return to home{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <>
              <p className="text-xs font-semibold tracking-[0.2em] text-blue-700 uppercase">
                Connect the Tools. Accelerate the Build.
              </p>
              <h1 className="mt-3 font-serif text-4xl tracking-[-0.035em] text-[#102f55] sm:text-5xl">
                Request access
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#526b88] sm:text-base">
                Tell us a little about your team and what you’re building. These
                details help us understand how Solution Velocity could fit your
                product workflow.
              </p>

              <form onSubmit={submit} className="mt-8 space-y-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field
                    label="What should we call you?"
                    htmlFor="request-name"
                  >
                    <Input
                      id="request-name"
                      autoComplete="name"
                      required
                      maxLength={100}
                      value={form.name}
                      onChange={set("name")}
                      placeholder="Your full name"
                    />
                  </Field>
                  <Field
                    label="Where can we reach you?"
                    htmlFor="request-email"
                  >
                    <Input
                      id="request-email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={254}
                      value={form.email}
                      onChange={set("email")}
                      placeholder="you@company.com"
                    />
                  </Field>
                  <Field
                    label="What is your company or team called?"
                    htmlFor="request-organization"
                  >
                    <Input
                      id="request-organization"
                      autoComplete="organization"
                      required
                      maxLength={120}
                      value={form.organization}
                      onChange={set("organization")}
                      placeholder="Company or team name"
                    />
                  </Field>
                  <Field
                    label="What best describes your role?"
                    htmlFor="request-role"
                  >
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
                  <Field
                    label="Which industry are you working in?"
                    htmlFor="request-industry"
                  >
                    <Select
                      id="request-industry"
                      required
                      value={form.industry}
                      onChange={set("industry")}
                      className={selectClass}
                    >
                      <option value="">Choose an industry</option>
                      {ACCESS_REQUEST_INDUSTRIES.map((industry) => (
                        <option key={industry} value={industry}>
                          {industry}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="How many people are on your product team?"
                    htmlFor="request-team-size"
                  >
                    <Select
                      id="request-team-size"
                      required
                      value={form.teamSize}
                      onChange={set("teamSize")}
                      className={selectClass}
                    >
                      <option value="">Choose team size</option>
                      {ACCESS_REQUEST_TEAM_SIZES.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Where is your product in its journey?"
                    htmlFor="request-stage"
                  >
                    <Select
                      id="request-stage"
                      required
                      value={form.productStage}
                      onChange={set("productStage")}
                      className={selectClass}
                    >
                      <option value="">Choose a product stage</option>
                      {ACCESS_REQUEST_STAGES.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="What tools or processes do you use today?"
                    htmlFor="request-tools"
                    hint="Optional — for example, spreadsheets or separate product tools."
                  >
                    <Input
                      id="request-tools"
                      maxLength={500}
                      value={form.currentTools}
                      onChange={set("currentTools")}
                      placeholder="Your current workflow"
                    />
                  </Field>
                </div>

                <Field
                  label="What would you most like to improve?"
                  htmlFor="request-goals"
                  hint="Tell us what is difficult today or what you hope to accomplish."
                >
                  <Textarea
                    id="request-goals"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={5}
                    value={form.goals}
                    onChange={set("goals")}
                    placeholder="What are you building, and where would a more connected workflow help?"
                  />
                </Field>

                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
                  >
                    {error}
                  </p>
                )}

                <div className="flex flex-col gap-3 border-t border-blue-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <p className="max-w-md text-xs leading-5 text-[#6b7f99]">
                    We’ll use your answers only to review this request and
                    respond to you.
                  </p>
                  <Button
                    type="submit"
                    loading={submitting}
                    className="min-h-11 rounded-full bg-gradient-to-r from-[#123c70] to-[#168ac2] px-6 text-white shadow-sm hover:brightness-110"
                  >
                    Send access request{" "}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
