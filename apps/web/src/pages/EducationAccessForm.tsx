import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ApiError, post } from '../api/client';
import { Button, Field, Input, Select, Textarea } from '../components/ui';

/**
 * Education enquiry form.
 *
 * Public pricing is temporarily withdrawn, so this form no longer asks anyone to
 * choose a plan, a seat count or a billing frequency. It submits an ordinary,
 * unpriced contact request tagged as Education — the pricing engine, the
 * education plans and the admin review tooling are untouched and still work for
 * existing priced records.
 */
export function EducationAccessForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [institution, setInstitution] = useState('');
  const [role, setRole] = useState('Student');
  const [country, setCountry] = useState('');
  const [level, setLevel] = useState('');
  const [teamSize, setTeamSize] = useState('Just me');
  const [goals, setGoals] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await post('/access-requests', {
        name,
        email,
        organization: institution.trim() || 'Independent student',
        role: 'Other',
        industry: 'Other',
        teamSize,
        country,
        currentTools: level ? `Education level: ${level}` : '',
        goals: `[Education] ${goals}`
      });
      setDone(true);
      window.scrollTo(0, 0);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not send the message. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div role="status" className="mt-8 rounded-lg border border-teal-200 bg-teal-50 p-6">
        <h2 className="text-xl font-semibold text-[#12394f]">Message sent.</h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Thank you — our team will reply to {email}. You do not need to wait to start: education users can
          create an account directly.
        </p>
        <Link to="/signup" className="mt-4 inline-flex min-h-10 items-center bg-[#153f5d] px-4 text-sm font-semibold text-white">
          Get Started
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-8">
      <section>
        <h2 className="text-xl font-semibold text-[#12394f]">Education enquiry</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Students, student teams and educational organisations can create an account directly — no request or
          invitation is required. Use this form to talk to us about a class, programme or institution.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Education-specific roles, teacher dashboards, cohorts and licence management are planned, not available
          today. Existing workspaces include project issues and product records; external review links can share
          selected project issues.
        </p>
      </section>
      <section className="border-t pt-6">
        <h2 className="text-xl font-semibold text-[#12394f]">Your details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="edu-name">
            <Input id="edu-name" required maxLength={100} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email" htmlFor="edu-email">
            <Input id="edu-email" type="email" required maxLength={254} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="School, university or programme" htmlFor="edu-institution" hint="Optional for independent students.">
            <Input id="edu-institution" maxLength={120} value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </Field>
          <Field label="Your role" htmlFor="edu-role">
            <Input id="edu-role" maxLength={100} value={role} onChange={(e) => setRole(e.target.value)} />
          </Field>
          <Field label="Country" htmlFor="edu-country">
            <Input id="edu-country" required maxLength={120} autoComplete="country-name" value={country} onChange={(e) => setCountry(e.target.value)} />
          </Field>
          <Field label="How many people?" htmlFor="edu-size">
            <Select id="edu-size" value={teamSize} onChange={(e) => setTeamSize(e.target.value)}>
              {['Just me', '2–5', '6–20', '21–50', '51–199', '200+'].map((size) => <option key={size} value={size}>{size}</option>)}
            </Select>
          </Field>
          <Field label="Educational level" htmlFor="edu-level">
            <Select id="edu-level" value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">Select a level</option>
              <option>Secondary school</option>
              <option>Undergraduate</option>
              <option>Postgraduate</option>
              <option>Vocational or technical</option>
              <option>Other</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4">
          <Field label="What would you like to discuss?" htmlFor="edu-goals">
            <Textarea id="edu-goals" required minLength={10} maxLength={2000} rows={3} value={goals} onChange={(e) => setGoals(e.target.value)} />
          </Field>
        </div>
      </section>
      {error && <p role="alert" className="border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button type="submit" loading={busy}>Send message</Button>
        <Link to="/signup" className="text-sm font-semibold text-blue-700 underline">Or create your account now</Link>
      </div>
    </form>
  );
}
