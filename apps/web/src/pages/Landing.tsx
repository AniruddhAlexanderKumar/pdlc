import { ArrowDown, ArrowRight, Boxes, Check, CircleDot, ClipboardList, GitBranch, Layers3, LineChart, ListChecks, Network, Package, Workflow } from 'lucide-react';
import { Link } from 'react-router';

const CAPABILITIES = [
  { icon: Layers3, number: '01', title: 'Keep the full picture', body: 'Bring product details, lifecycle stages, materials and costs into one workspace.' },
  { icon: ListChecks, number: '02', title: 'Move work forward', body: 'Organize project issues and product tasks so the next step is clear.' },
  { icon: Network, number: '03', title: 'See the connections', body: 'Explore people, projects and recorded dependencies in the Teamwork Graph.' }
];
const STAGES = ['Idea', 'Research', 'Planning', 'Design', 'Prototype', 'Testing', 'Launch', 'Improvement'];

export function LandingPage() {
  return (
    <div className="landing min-h-full bg-[#f8fafc] text-[#172c44] selection:bg-blue-100">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-20 max-w-[1280px] items-center justify-between gap-6 px-5 sm:px-8 lg:px-12">
          <Link to="/" aria-label="Solution Velocity home" className="flex shrink-0 items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
            <img src="/solution-velocity-logo.png" alt="" className="h-9 w-16 object-contain" />
            <span className="border-l border-slate-200 pl-3 text-sm font-semibold tracking-tight text-[#17365e]">Solution<br /><span className="font-normal">Velocity</span></span>
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#capabilities" className="transition-colors hover:text-blue-700">Capabilities</a>
            <a href="#workflow" className="transition-colors hover:text-blue-700">How it works</a>
            <a href="#stages" className="transition-colors hover:text-blue-700">Lifecycle</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link to="/login" className="rounded-md px-3 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:text-blue-700">Sign in</Link>
            <Link to="/request-access" className="inline-flex items-center gap-2 rounded-md bg-[#164e82] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#103d69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Request access <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden="true" /></Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-slate-200 bg-white">
          <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-[#f3f7fb] max-lg:hidden" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-[1280px] gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-24 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-20 lg:px-12 lg:py-28">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 border-l-2 border-[#2c82b5] pl-3 text-[11px] font-bold uppercase tracking-[0.17em] text-[#316c97]">Connect the tools. Accelerate the build.</div>
              <h1 className="mt-7 text-[clamp(2.8rem,5.4vw,5rem)] font-semibold leading-[1.06] tracking-[-0.055em] text-[#102c4a]">From first idea to <span className="text-[#2379aa]">what’s next.</span></h1>
              <p className="mt-6 max-w-lg text-base leading-8 text-slate-600 sm:text-lg">A clearer way to develop products, coordinate work and keep the details connected—from discovery through launch and beyond.</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link to="/request-access" className="inline-flex min-h-12 items-center gap-3 rounded-md bg-[#164e82] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#103d69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Request access <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                <a href="#workflow" className="inline-flex min-h-12 items-center gap-2 rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700">Explore the platform <ArrowDown className="h-4 w-4" aria-hidden="true" /></a>
              </div>
              <div className="mt-12 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium text-slate-500"><span>Product development</span><span className="h-1 w-1 rounded-full bg-slate-300" /><span>Project coordination</span><span className="h-1 w-1 rounded-full bg-slate-300" /><span>Team context</span></div>
            </div>

            <div className="relative mx-auto w-full max-w-[570px]" aria-label="Illustration of a connected product workflow">
              <div className="absolute -left-5 -top-5 h-24 w-24 border-l border-t border-[#9bbad0]" aria-hidden="true" />
              <div className="absolute -bottom-5 -right-5 h-24 w-24 border-b border-r border-[#9bbad0]" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-xl border border-[#d9e4ed] bg-white shadow-[0_20px_55px_-25px_rgba(27,61,93,0.28)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-[#246b9d]"><Workflow className="h-4 w-4" /></span><span className="text-sm font-semibold text-[#17365e]">A connected workflow</span></div><span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Platform overview</span></div>
                <div className="grid gap-4 bg-[#f8fafc] p-5 sm:grid-cols-[1fr_1fr]">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 sm:row-span-2"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Product lifecycle</p><h2 className="mt-2 text-base font-semibold text-[#17365e]">A clear path forward</h2><div className="mt-5 space-y-0">{['Discover', 'Plan & build', 'Test & improve'].map((item, i) => <div key={item} className="flex gap-3"><div className="flex flex-col items-center"><span className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${i === 0 ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-500'}`}>{i === 0 ? <Check className="h-3.5 w-3.5" /> : `0${i + 1}`}</span>{i < 2 && <span className="h-7 w-px bg-slate-200" />}</div><span className="pt-1 text-sm font-medium text-slate-700">{item}</span></div>)}</div></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-[#2874a5]"><ClipboardList className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-wider">Work & decisions</span></div><p className="mt-3 text-sm font-semibold text-slate-700">Keep tasks in context</p><p className="mt-1 text-xs leading-5 text-slate-500">Connect daily work to the bigger picture.</p></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-[#2874a5]"><GitBranch className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-wider">Teamwork graph</span></div><p className="mt-3 text-sm font-semibold text-slate-700">Follow the connections</p><p className="mt-1 text-xs leading-5 text-slate-500">Explore relationships across your workspace.</p></div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400"><span>From planning to progress</span><span className="font-medium text-[#387ca6]">Solution Velocity</span></div>
              </div>
            </div>
          </div>
        </section>

        <section id="capabilities" className="scroll-mt-20 border-b border-slate-200 bg-[#f8fafc] px-5 py-20 sm:px-8 lg:px-12 lg:py-28">
          <div className="mx-auto max-w-[1184px]"><div className="grid gap-5 md:grid-cols-[1fr_1fr] md:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#307ba9]">The essentials, together</p><h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#102c4a] sm:text-4xl">Less searching.<br />More forward motion.</h2></div><p className="max-w-md text-sm leading-7 text-slate-500 md:justify-self-end">Product work spans people, decisions, costs and tasks. Bring those moving parts into a workspace designed to help you stay oriented.</p></div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">{CAPABILITIES.map(({icon: Icon, number, title, body}) => <article key={number} className="flex min-h-56 flex-col rounded-lg border border-slate-200 bg-white p-6"><div className="flex items-start justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#edf5fa] text-[#246b9d]"><Icon className="h-5 w-5" /></span><span className="text-xs font-semibold tabular-nums text-slate-300">{number}</span></div><h3 className="mt-8 text-base font-semibold text-[#17365e]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{body}</p></article>)}</div>
          </div>
        </section>

        <section id="workflow" className="scroll-mt-20 bg-white px-5 py-20 sm:px-8 lg:px-12 lg:py-28"><div className="mx-auto grid max-w-[1184px] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#307ba9]">A practical rhythm</p><h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.035em] text-[#102c4a] sm:text-4xl">A workspace that moves with your product.</h2><p className="mt-5 text-sm leading-7 text-slate-500">Start with what you know. Add detail as you go. Keep your work, costs and next steps in view.</p><Link to="/request-access" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#1d6d9f] hover:text-[#103d69]">Get started <ArrowRight className="h-4 w-4" /></Link></div><div className="divide-y divide-slate-200 border-y border-slate-200">{[{n:'01', icon: CircleDot, title:'Tell us', body:'Capture the idea, customer and important questions.'}, {n:'02', icon: Boxes, title:'Track it', body:'Manage materials, tasks and costs as your product develops.'}, {n:'03', icon: LineChart, title:'Improve it', body:'Use your product context to identify useful next steps.'}].map(({n, icon: Icon, title, body}) => <div key={n} className="grid grid-cols-[36px_1fr] gap-4 py-6 sm:grid-cols-[42px_1fr_auto] sm:items-center"><span className="text-xs font-semibold text-slate-400">{n}</span><div><h3 className="text-base font-semibold text-[#17365e]">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{body}</p></div><Icon className="hidden h-5 w-5 text-[#83a5be] sm:block" /></div>)}</div></div></section>

        <section id="stages" className="scroll-mt-20 border-t border-slate-200 bg-[#f1f6fa] px-5 py-20 sm:px-8 lg:px-12"><div className="mx-auto max-w-[1184px]"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#307ba9]">The product lifecycle</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-[#102c4a] sm:text-4xl">Keep the whole journey in view.</h2></div><p className="max-w-sm text-sm leading-7 text-slate-500">A shared view of where your product is today—and where it can go next.</p></div><ol className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4 lg:grid-cols-8">{STAGES.map((stage, i) => <li key={stage} className="min-h-24 bg-white p-4"><span className="text-[11px] font-semibold text-[#80a3ba]">{String(i + 1).padStart(2, '0')}</span><p className="mt-4 text-sm font-semibold text-[#26435e]">{stage}</p></li>)}</ol></div></section>

        <section className="bg-[#123451] px-5 py-16 text-white sm:px-8 lg:px-12"><div className="mx-auto flex max-w-[1184px] flex-col items-start justify-between gap-7 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#91c5e1]">Ready when you are</p><h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Make room for your next good idea.</h2><p className="mt-2 text-sm text-blue-100/70">Bring your product work together in Solution Velocity.</p></div><Link to="/request-access" className="inline-flex min-h-12 items-center gap-3 rounded-md bg-white px-5 text-sm font-semibold text-[#164e82] transition-colors hover:bg-blue-50">Request access <ArrowRight className="h-4 w-4" /></Link></div></section>
      </main>
      <footer className="border-t border-slate-200 bg-white px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-[1184px] flex-col justify-between gap-4 text-xs text-slate-500 sm:flex-row sm:items-center"><div className="flex items-center gap-2 font-semibold text-[#17365e]"><Package className="h-4 w-4 text-[#307ba9]" /> Solution Velocity</div><p>Connect the tools. Accelerate the build.</p><div className="flex gap-5"><Link to="/login" className="hover:text-blue-700">Sign in</Link><Link to="/request-access" className="hover:text-blue-700">Request access</Link></div></div></footer>
    </div>
  );
}
