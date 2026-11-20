import { ArrowRight, KeyRound, Layers3, PackagePlus, ScanSearch, Share2, Sparkles } from 'lucide-react';
import { Link } from 'react-router';

/**
 * The three things a visitor wants answered before signing up: what happens,
 * how long it takes, and whether it costs anything. Kept to the facts the
 * registration flow actually performs, in the order it performs them.
 */
const STEPS = [
  { icon: KeyRound, label: 'Create your account', detail: 'Your name, email and a password of at least 10 characters. Accept the Terms and Privacy Policy.', note: 'No card, no waiting list' },
  { icon: PackagePlus, label: 'Name what you are building', detail: 'Tell us the product and whether you are starting fresh or already have something in progress.', note: 'One product or several' },
  { icon: Sparkles, label: 'Open World 1', detail: 'Your product starts at the right lifecycle stage, with its lessons, quests and first checkpoint ready.', note: 'First lesson immediately' }
] as const;

export function GettingStartedSection() {
  return <section id="get-started" aria-labelledby="get-started-heading" className="scroll-mt-32 border-b border-[#dbe6ea] bg-white px-5 py-16 sm:px-8 sm:py-20 lg:scroll-mt-24 lg:px-12 lg:py-24">
    <div className="mx-auto max-w-[1224px]">
      <div className="grid gap-6 lg:grid-cols-[0.85fr_1.15fr] lg:items-end lg:gap-20">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#287b9a]">Getting started</p>
          <h2 id="get-started-heading" className="mt-4 max-w-xl text-3xl font-semibold leading-[1.1] tracking-[-0.04em] text-[#102f46] sm:text-4xl lg:text-5xl">Set up in a few minutes, not a few meetings.</h2>
        </div>
        <p className="max-w-lg text-base leading-7 text-slate-600 lg:justify-self-end">No waiting list, invitation or payment step during the launch period. You can also look around first with a temporary sample workspace.</p>
      </div>

      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, label, detail, note }, index) => <li key={label} className="flex flex-col border border-[#d9e6ea] bg-[#fbfdfd] p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="flex h-10 w-10 items-center justify-center border border-[#cfe0e7] bg-white text-[#247a9c]"><Icon className="h-4 w-4" aria-hidden="true" /></span>
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600">Step {index + 1}</span>
          </div>
          <h3 className="mt-4 text-base font-semibold text-[#15384f]">{label}</h3>
          <p className="mt-2 flex-1 text-sm leading-6 text-slate-600">{detail}</p>
          <p className="mt-4 border-t border-[#e2ecee] pt-3 text-xs font-semibold text-[#287b9a]">{note}</p>
        </li>)}
      </ol>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.35fr_0.65fr]">
        <div className="flex flex-col justify-between gap-6 bg-[#10384e] p-6 text-white sm:p-8">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#9bd0df]">Not ready to sign up?</p>
            <h3 className="mt-3 max-w-xl text-2xl font-semibold leading-tight tracking-[-0.03em] sm:text-[28px]">Open a sample workspace and try the journey first.</h3>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[#c4d8e1]">A separate, temporary workspace with sample products, materials and suppliers. Changes expire after two hours, and you should not enter sensitive information.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/try-demo" className="inline-flex min-h-12 items-center justify-center gap-3 bg-white px-5 text-sm font-semibold text-[#153f5d] hover:bg-[#eaf5f8]">Try the demo <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
            <Link to="/signup" className="inline-flex min-h-12 items-center justify-center gap-3 border border-white/40 px-5 text-sm font-semibold text-white hover:bg-white/10">Create an account</Link>
          </div>
        </div>
        <div className="border border-[#d9e6ea] bg-[#f7fafb] p-6 sm:p-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">While you are here</p>
          <ul className="mt-4 divide-y divide-[#e2ecee]">
            {[
              { icon: ScanSearch, label: 'Explore the platform', href: '#capabilities' },
              { icon: Layers3, label: 'See the eight worlds', href: '#journey' },
              { icon: Share2, label: 'Read about external review', href: '#security' },
              { icon: Sparkles, label: 'Browse the questions', href: '#faq' }
            ].map(({ icon: Icon, label, href }) => <li key={label}><a href={href} className="flex min-h-11 items-center gap-3 py-3 text-sm font-medium text-[#2c556b] hover:text-[#113e59]"><Icon className="h-4 w-4 shrink-0 text-[#4d94a9]" aria-hidden="true" />{label}<ArrowRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[#7ea6b7]" aria-hidden="true" /></a></li>)}
          </ul>
        </div>
      </div>
    </div>
  </section>;
}
