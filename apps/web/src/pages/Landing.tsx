import { useState } from 'react';
import {
  ArrowDown, ArrowRight, Boxes, Check, ChevronRight, CircleHelp, ClipboardList,
  GitBranch, Layers3, Lightbulb, Link2, Mic, Network, Package, ScanSearch, ShieldCheck,
  Sparkles, Users, Workflow, Zap
} from 'lucide-react';
import { Link } from 'react-router';

const STAGES = ['Idea', 'Research', 'Planning', 'Design', 'Prototype', 'Testing', 'Launch', 'Improvement'];
const GRAPH_RECORDS = [
  { title: 'Project', detail: 'A workspace for a product initiative.', icon: ClipboardList, tone: 'blue' },
  { title: 'Issue', detail: 'Tasks, bugs and stories with owners, status and priority.', icon: Check, tone: 'teal' },
  { title: 'Product', detail: 'Lifecycle stage, discovery, costs and product details.', icon: Package },
  { title: 'Team member', detail: 'Workspace membership and issue assignments.', icon: Users },
  { title: 'Product task', detail: 'A checklist task held within its product record.', icon: Check }
] as const;

export function LandingPage() {
  const [selectedGraphNode, setSelectedGraphNode] = useState(0);
  const [selectedFlowStep, setSelectedFlowStep] = useState(0);
  const selectedRecord = GRAPH_RECORDS[selectedGraphNode];
  const flowSteps = [
    { title: 'A trigger', detail: 'An event starts the process.', icon: Zap },
    { title: 'An AI step', detail: 'An agent contributes a bounded task.', icon: Sparkles },
    { title: 'A decision', detail: 'A condition routes the next step.', icon: GitBranch },
    { title: 'Human review', detail: 'A person checks and approves.', icon: Users },
    { title: 'An action', detail: 'A supported action completes the flow.', icon: Check }
  ];
  const FlowIcon = flowSteps[selectedFlowStep].icon;

  return (
    <div className="landing min-h-full bg-[#f8fafc] text-[#172c44] selection:bg-blue-100">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-12">
          <div className="flex h-[72px] items-center justify-between gap-4">
          <Link to="/" aria-label="Solution Velocity home" className="flex shrink-0 items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600">
            <img src="/solution-velocity-logo.png" alt="" className="h-9 w-16 object-contain" />
            <span className="border-l border-slate-200 pl-3 text-sm font-semibold tracking-tight text-[#17365e]">Solution<br /><span className="font-normal">Velocity</span></span>
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-7 text-sm font-medium text-slate-600 lg:flex">
            <a href="#platform" className="hover:text-blue-700">Platform</a>
            <a href="#intelligence" className="hover:text-blue-700">Intelligence</a>
            <a href="#connected" className="hover:text-blue-700">Connected engineering</a>
            <a href="#automation" className="hover:text-blue-700">Automation</a>
          </nav>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link to="/login" className="hidden rounded-md px-3 py-2.5 text-sm font-semibold text-slate-600 hover:text-blue-700 sm:inline-flex">Sign in</Link>
            <Link to="/request-access" className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#164e82] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#103d69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Get started <ArrowRight className="hidden h-4 w-4 sm:block" aria-hidden="true" /></Link>
          </div>
          </div>
          <nav aria-label="Platform sections" className="flex gap-5 overflow-x-auto border-t border-slate-100 px-0 py-2.5 text-xs font-medium text-slate-600 lg:hidden">
            <a href="#platform" className="shrink-0 hover:text-blue-700">Platform</a><a href="#intelligence" className="shrink-0 hover:text-blue-700">Intelligence</a><a href="#connected" className="shrink-0 hover:text-blue-700">Connected engineering</a><a href="#automation" className="shrink-0 hover:text-blue-700">Automation</a>
          </nav>
        </div>
      </header>

      <main>
        {/* 01 — Hero */}
        <section className="relative overflow-hidden border-b border-slate-200 bg-white">
          <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] bg-[#f1f6fa] lg:block" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16 lg:px-12 lg:py-24">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 border-l-2 border-[#2c82b5] pl-3 text-[11px] font-bold uppercase tracking-[0.17em] text-[#316c97]">Product development, connected</div>
              <h1 className="mt-6 text-[clamp(2.8rem,5.2vw,4.6rem)] font-semibold leading-[1.04] tracking-[-0.055em] text-[#102c4a]">Build products.<br />Connect engineering.<br /><span className="text-[#2379aa]">Accelerate innovation.</span></h1>
              <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">An integrated Product Development Lifecycle Management workspace for product teams—bringing lifecycle planning, engineering project management, collaboration and practical intelligence together.</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/request-access" className="inline-flex min-h-12 items-center gap-3 rounded-md bg-[#164e82] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#103d69] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Get started <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
                <a href="#platform" className="inline-flex min-h-12 items-center gap-2 rounded-md border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700">Explore the platform <ArrowDown className="h-4 w-4" aria-hidden="true" /></a>
              </div>
              <p className="mt-7 text-xs font-medium text-slate-500">For teams taking a product from first idea through launch and improvement.</p>
            </div>

            <div className="relative mx-auto w-full max-w-[620px]" aria-label="Illustrative Solution Velocity product workspace">
              <div className="absolute -left-4 -top-4 h-24 w-24 border-l border-t border-[#9bbad0]" aria-hidden="true" />
              <div className="absolute -bottom-4 -right-4 h-24 w-24 border-b border-r border-[#9bbad0]" aria-hidden="true" />
              <div className="relative overflow-hidden rounded-xl border border-[#d9e4ed] bg-white shadow-[0_24px_60px_-30px_rgba(27,61,93,0.35)]">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5"><div className="flex items-center gap-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-[#246b9d]"><Layers3 className="h-4 w-4" aria-hidden="true" /></span><div><p className="text-xs font-semibold text-[#17365e]">Product workspace</p><p className="text-[10px] text-slate-400">Illustrative view · example data; capabilities available in-product</p></div></div><span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 sm:block">Prototype</span></div>
                <div className="grid gap-3 bg-[#f8fafc] p-4 sm:grid-cols-[1.1fr_0.9fr] sm:p-5">
                  <div className="rounded-lg border border-slate-200 bg-white p-4 sm:row-span-2">
                    <div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Product lifecycle</p><span className="text-[10px] font-medium text-[#387ca6]">04 / 08</span></div>
                    <h2 className="mt-2 text-lg font-semibold tracking-tight text-[#17365e]">AeroFlow desk fan</h2>
                    <div className="mt-5 flex items-center gap-1" aria-label="Lifecycle progress"><span className="h-1.5 flex-1 rounded-full bg-[#2c82b5]" /><span className="h-1.5 flex-1 rounded-full bg-[#2c82b5]" /><span className="h-1.5 flex-1 rounded-full bg-[#2c82b5]" /><span className="h-1.5 flex-1 rounded-full bg-[#2c82b5]" /><span className="h-1.5 flex-1 rounded-full bg-slate-100" /><span className="h-1.5 flex-1 rounded-full bg-slate-100" /></div>
                    <div className="mt-4 flex justify-between text-[9px] font-medium text-slate-400"><span>Idea</span><span>Testing</span><span>Launch</span></div>
                    <div className="mt-6 border-t border-slate-100 pt-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-700">Next up</span><span className="rounded bg-amber-50 px-2 py-1 text-[9px] font-semibold text-amber-700">In progress</span></div><p className="mt-2 text-xs text-slate-500">Validate airflow and refine the housing.</p><div className="mt-3 h-1.5 w-full rounded-full bg-slate-100"><div className="h-1.5 w-[62%] rounded-full bg-[#4a91ba]" /></div></div>
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-[#2874a5]"><ClipboardList className="h-4 w-4" aria-hidden="true" /><span className="text-[10px] font-bold uppercase tracking-wider">Project work</span></div><p className="mt-3 text-sm font-semibold text-slate-700">3 open issues</p><p className="mt-1 text-xs leading-5 text-slate-500">Plan and track project tasks in context.</p></div>
                  <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-[#2874a5]"><Network className="h-4 w-4" aria-hidden="true" /><span className="text-[10px] font-bold uppercase tracking-wider">Teamwork Graph</span></div><p className="mt-3 text-sm font-semibold text-slate-700">Records, connected</p><p className="mt-1 text-xs leading-5 text-slate-500">Explore relationships and dependencies.</p></div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-[10px] text-slate-400 sm:px-5"><span>Product development lifecycle management</span><span className="font-medium text-[#387ca6]">Solution Velocity</span></div>
              </div>
            </div>
          </div>
        </section>

        {/* 02 — Platform */}
        <section id="platform" className="scroll-mt-20 border-b border-slate-200 bg-[#f8fafc] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-[1184px]">
            <div className="grid gap-6 md:grid-cols-[1fr_0.75fr] md:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#307ba9]">01 / The platform</p><h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#102c4a] sm:text-4xl">One product journey.<br className="hidden sm:block" /> Connected work at every stage.</h2></div><p className="max-w-md text-sm leading-7 text-slate-500 md:justify-self-end">Solution Velocity brings the product record and day-to-day execution closer together—so teams can move from discovery to delivery with less context switching.</p></div>
            <div className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.18fr]">
              <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex items-center gap-2 text-[#2874a5]"><Package className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">Product lifecycle</span></div><h3 className="mt-4 text-xl font-semibold tracking-tight text-[#17365e]">From idea to improvement</h3><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">Manage product details, discovery answers, stage progress, materials, suppliers, bill of materials, costs and improvement insights.</p>
                <ol className="mt-7 grid grid-cols-4 gap-x-2 gap-y-4" aria-label="Implemented product lifecycle stages">{STAGES.map((stage, i) => <li key={stage} className="min-w-0"><div className={`mb-2 h-1 rounded-full ${i < 4 ? 'bg-[#3986b2]' : 'bg-slate-100'}`} /><span className="block text-[10px] font-medium leading-4 text-slate-500 sm:text-xs">{stage}</span></li>)}</ol>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#edf5fa] text-[#246b9d]"><ClipboardList className="h-4 w-4" /></div><h3 className="mt-5 text-base font-semibold text-[#17365e]">Project & task management</h3><p className="mt-2 text-sm leading-6 text-slate-500">Create projects, track tasks, bugs and stories, assign owners and follow work through open, in-progress and done.</p></article>
                <article className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#edf5fa] text-[#246b9d]"><Boxes className="h-4 w-4" /></div><h3 className="mt-5 text-base font-semibold text-[#17365e]">Product operations</h3><p className="mt-2 text-sm leading-6 text-slate-500">Bring materials, suppliers, quotes and cost inputs alongside the product they support.</p></article>
                <article className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#edf5fa] text-[#246b9d]"><Users className="h-4 w-4" /></div><h3 className="mt-5 text-base font-semibold text-[#17365e]">Workspace collaboration</h3><p className="mt-2 text-sm leading-6 text-slate-500">Work in shared workspaces with memberships, role-aware access, assignments and team visibility.</p></article>
                <article className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#edf5fa] text-[#246b9d]"><GitBranch className="h-4 w-4" /></div><h3 className="mt-5 text-base font-semibold text-[#17365e]">Traceability, with honest scope</h3><p className="mt-2 text-sm leading-6 text-slate-500">Explore recorded project, issue, product, task and people relationships. Requirements and verification records are not yet modeled.</p></article>
              </div>
            </div>
            <p className="mt-5 text-xs text-slate-400">Current product scope, not a promise of a complete enterprise PLM suite.</p>
          </div>
        </section>

        {/* 03 — Intelligence */}
        <section id="intelligence" className="scroll-mt-20 border-b border-slate-200 bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-[1184px]"><div className="grid gap-6 md:grid-cols-[1fr_0.75fr] md:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#307ba9]">02 / Intelligence layer</p><h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#102c4a] sm:text-4xl">Useful intelligence, grounded in the work.</h2></div><p className="max-w-md text-sm leading-7 text-slate-500 md:justify-self-end">Today, AI supports specific product-ideation and graph-query workflows. The broader copilot and persistent context experience is a product direction—not a capability we claim is already live.</p></div>
            <div className="mt-10 grid overflow-hidden rounded-xl border border-slate-200 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="bg-[#f5f8fb] p-6 sm:p-8">
                <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[#2874a5]"><Sparkles className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">AI assistance · limited workflows</span></div><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Available</span></div>
                <h3 className="mt-5 text-2xl font-semibold tracking-tight text-[#17365e]">AI that starts with your engineering context.</h3><p className="mt-3 max-w-lg text-sm leading-6 text-slate-600">Use voice dictation to describe a product idea; the configured AI can structure it into a reviewable draft. In Teamwork Graph, the configured model interprets a bounded question while the server retrieves matching workspace records. Results should be checked by a person.</p>
                <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                  <div className="flex flex-1 items-start gap-3 rounded-lg border border-slate-200 bg-white p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[#246b9d]"><Mic className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-[#17365e]">Voice Agent</p><p className="mt-1 text-xs leading-5 text-slate-500">Hands-free product ideation capture, transcript processing and a review-before-import flow. Not voice navigation.</p></div></div>
                  <div className="flex flex-1 items-start gap-3 rounded-lg border border-slate-200 bg-white p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[#246b9d]"><ScanSearch className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-[#17365e]">Graph query assistant</p><p className="mt-1 text-xs leading-5 text-slate-500">Ask about recorded issue dependencies and a limited set of workspace patterns.</p></div></div>
                </div>
              </div>
              <div className="flex flex-col justify-between border-t border-slate-200 bg-white p-6 sm:p-8 lg:border-l lg:border-t-0">
                <div><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-slate-500"><Lightbulb className="h-4 w-4" /><span className="text-[10px] font-bold uppercase tracking-[0.14em]">Product direction</span></div><span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-800">Concept · not live</span></div><h3 className="mt-5 text-xl font-semibold tracking-tight text-[#17365e]">A more continuous engineering companion.</h3><p className="mt-3 text-sm leading-6 text-slate-500">Velocity Copilot and Persistent Product Memory describe a future intelligence layer: contextual help across records, with relevant product history available between sessions. Neither a general copilot nor persistent cross-session product memory is currently implemented.</p></div>
                <div className="mt-7 space-y-3">
                  <div className="flex items-center gap-3 rounded-lg bg-[#f8fafc] p-3"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-[#447ba0] shadow-sm"><Sparkles className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-semibold text-[#17365e]">Velocity Copilot</p><p className="text-[10px] text-slate-500">Contextual engineering companion · planned</p></div><CircleHelp className="ml-auto h-4 w-4 shrink-0 text-slate-300" /></div>
                  <div className="flex items-center gap-3 rounded-lg bg-[#f8fafc] p-3"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-[#447ba0] shadow-sm"><Layers3 className="h-4 w-4" /></span><div className="min-w-0"><p className="text-xs font-semibold text-[#17365e]">Persistent Product Memory</p><p className="text-[10px] text-slate-500">Permission-aware context across sessions · planned</p></div><ShieldCheck className="ml-auto h-4 w-4 shrink-0 text-slate-300" /></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 04 — Connected engineering */}
        <section id="connected" className="scroll-mt-20 border-b border-slate-200 bg-[#f8fafc] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="mx-auto grid max-w-[1184px] items-center gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-16">
            <div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#307ba9]">03 / Connected engineering</p><h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#102c4a] sm:text-4xl">Every relationship.<br />One connected workspace.</h2><p className="mt-5 text-sm leading-7 text-slate-600">Teamwork Graph makes recorded connections visible: projects contain issues, products contain checklist tasks, and people connect to work through membership and assignment. Add explicit issue dependencies or related links to explore impact and context.</p><p className="mt-4 text-xs leading-5 text-slate-400">Graph coverage is bounded and reflects records actually stored. It is not a requirements-to-evidence traceability system; requirements, design decisions, verification and evidence records are not currently modeled.</p>
              <div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">Dependency links</span><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">Cross-project visibility</span><span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600">Change impact view</span></div>
              <Link to="/teamwork-graph" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#1d6593] hover:text-blue-800">Explore Teamwork Graph <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-35px_rgba(27,61,93,0.45)] sm:p-7">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4"><div><p className="text-sm font-semibold text-[#17365e]">Teamwork Graph</p><p className="mt-1 text-[10px] text-slate-400">Interactive concept map of implemented record types</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-700">Available</span></div>
              <div className="relative mx-auto mt-5 flex min-h-[238px] max-w-[520px] items-center justify-center overflow-hidden rounded-lg bg-[#f8fafc] p-3 sm:min-h-[260px]">
                <div className="relative z-10 mx-auto flex w-full max-w-[430px] flex-col gap-3">
                  {[[0, 'contains', 1], [3, 'contains', 4], [2, 'assigned to', 1], [1, 'depends on / relates to', 1]].map(([from, relation, to], row) => {
                    const fromIndex = Number(from);
                    const toIndex = Number(to);
                    const FromIcon = GRAPH_RECORDS[fromIndex].icon;
                    const ToIcon = GRAPH_RECORDS[toIndex].icon;
                    return <div key={row} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <button type="button" onClick={() => setSelectedGraphNode(fromIndex)} aria-pressed={selectedGraphNode === fromIndex} className={`min-w-0 rounded-lg border bg-white px-2 py-2 text-center shadow-sm transition focus-visible:outline-2 focus-visible:outline-blue-600 sm:px-3 ${selectedGraphNode === fromIndex ? 'border-[#3a82ac] ring-2 ring-blue-100' : 'border-slate-200'}`}><FromIcon className="mx-auto h-4 w-4 text-[#347ba6]" /><span className="mt-1 block truncate text-[10px] font-semibold text-slate-700">{GRAPH_RECORDS[fromIndex].title}</span></button>
                      <span className="max-w-[108px] text-center text-[9px] font-medium leading-4 text-slate-400">{relation}</span>
                      <button type="button" onClick={() => setSelectedGraphNode(toIndex)} aria-pressed={selectedGraphNode === toIndex} className={`min-w-0 rounded-lg border bg-white px-2 py-2 text-center shadow-sm transition focus-visible:outline-2 focus-visible:outline-blue-600 sm:px-3 ${selectedGraphNode === toIndex ? 'border-[#3a82ac] ring-2 ring-blue-100' : 'border-slate-200'}`}><ToIcon className="mx-auto h-4 w-4 text-teal-600" /><span className="mt-1 block truncate text-[10px] font-semibold text-slate-700">{GRAPH_RECORDS[toIndex].title}</span></button>
                    </div>;
                  })}
                </div>
              </div>
              <div aria-live="polite" className="mt-4 flex items-center gap-3 rounded-lg border border-blue-100 bg-blue-50/70 p-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-[#3279a2]"><selectedRecord.icon className="h-4 w-4" /></span><div><p className="text-xs font-semibold text-[#17365e]">{selectedRecord.title}</p><p className="mt-0.5 text-[10px] leading-4 text-slate-500">{selectedRecord.detail}</p></div></div>
            </div>
          </div>
        </section>

        {/* 05 — Automation */}
        <section id="automation" className="scroll-mt-20 border-b border-slate-200 bg-white px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="mx-auto grid max-w-[1184px] items-center gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
            <div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#307ba9]">04 / Workflow automation</p><div className="mt-4 flex flex-wrap items-center gap-2"><h2 className="text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#102c4a] sm:text-4xl">People and AI,<br />in the same flow.</h2><span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide text-amber-800">Concept · not live</span></div><p className="mt-5 text-sm leading-7 text-slate-600">Workflow Automation Canvas is a proposed way to connect triggers, AI tasks, conditional branches, human approval and supported actions. It is a product concept—not a currently available visual builder or execution engine.</p><div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full bg-[#f4f7fa] px-3 py-1.5 text-xs text-slate-600">Event trigger</span><span className="rounded-full bg-[#f4f7fa] px-3 py-1.5 text-xs text-slate-600">Conditional route</span><span className="rounded-full bg-[#f4f7fa] px-3 py-1.5 text-xs text-slate-600">Human checkpoint</span></div></div>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-[#f8fafc] p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[#2874a5]"><Workflow className="h-4 w-4" /><span className="text-xs font-semibold text-[#17365e]">Workflow Automation Canvas</span></div><span className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Conceptual illustration</span></div>
              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3" role="group" aria-label="Explore conceptual workflow steps">{flowSteps.map(({title, icon: Icon}, i) => <button key={title} type="button" onClick={() => setSelectedFlowStep(i)} aria-pressed={selectedFlowStep === i} className={`relative flex min-h-[84px] flex-col items-center justify-center rounded-lg border bg-white p-2 text-center transition focus-visible:outline-2 focus-visible:outline-blue-600 sm:min-h-[105px] ${selectedFlowStep === i ? 'border-[#4a8db5] ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'} ${i === 4 ? 'col-span-2 sm:col-span-1' : ''}`}><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${i === 1 ? 'bg-violet-50 text-violet-700' : i === 3 ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-[#3279a2]'}`}><Icon className="h-4 w-4" /></span><span className="mt-2 text-[10px] font-semibold text-slate-700">{title}</span>{i < 4 && <ChevronRight className="absolute -right-2.5 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 rounded-full bg-[#f8fafc] text-slate-400 sm:block" />}</button>)}</div>
              <div aria-live="polite" className="mt-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#edf5fa] text-[#246b9d]"><FlowIcon className="h-4 w-4" /></span><div><p className="text-xs font-semibold text-[#17365e]">{flowSteps[selectedFlowStep].title}</p><p className="mt-0.5 text-[10px] text-slate-500">{flowSteps[selectedFlowStep].detail}</p></div></div>
              <div className="mt-4 flex items-start gap-2 border-t border-slate-200 pt-3 text-[10px] leading-5 text-slate-400"><CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0" /><p>No workflow canvas, execution monitoring or multi-agent workspace is currently implemented. Solution Velocity presently supports specific voice and graph AI experiences; it does not claim autonomous workflow execution or coordinated specialist agents.</p></div>
            </div>
          </div>
        </section>

        {/* 06 — Joined-up journey */}
        <section className="border-b border-slate-200 bg-[#f8fafc] px-5 py-16 sm:px-8 sm:py-20 lg:px-12 lg:py-24">
          <div className="mx-auto max-w-[1184px]"><div className="grid gap-6 md:grid-cols-[1fr_0.75fr] md:items-end"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#307ba9]">05 / One connected workspace</p><h2 className="mt-4 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#102c4a] sm:text-4xl">A product journey, not a pile of tools.</h2></div><p className="max-w-md text-sm leading-7 text-slate-500 md:justify-self-end">Today, teams can capture an idea by voice, review the structured draft, create product and project records, then explore recorded connections in the graph.</p></div>
            <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[{ n: '01', title: 'Capture an idea', text: 'Describe a new product using voice or text.', icon: Mic }, { n: '02', title: 'Review the draft', text: 'Check the AI-structured product, discovery answers and starter work items.', icon: Check }, { n: '03', title: 'Coordinate work', text: 'Manage the product lifecycle and project issues with your team.', icon: ClipboardList }, { n: '04', title: 'Explore connections', text: 'Use Teamwork Graph to inspect recorded relationships and dependencies.', icon: Network }].map(({n, title, text, icon: Icon}, i) => <li key={n} className="relative rounded-xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><span className="text-[10px] font-bold tabular-nums text-[#6f9cb8]">{n}</span><Icon className="h-4 w-4 text-[#377da5]" /></div><h3 className="mt-6 text-sm font-semibold text-[#17365e]">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{text}</p>{i < 3 && <ArrowRight aria-hidden="true" className="absolute -right-2.5 top-1/2 z-10 hidden h-5 w-5 -translate-y-1/2 rounded-full bg-[#f8fafc] p-0.5 text-slate-400 lg:block" />}</li>)}
            </ol>
          </div>
        </section>

        {/* 07 — CTA */}
        <section className="bg-[#123451] px-5 py-14 text-white sm:px-8 sm:py-16 lg:px-12"><div className="mx-auto flex max-w-[1184px] flex-col items-start justify-between gap-7 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.17em] text-[#91c5e1]">Bring the work together</p><h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Your engineering ecosystem. Connected.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-blue-100/75">Bring product development, engineering collaboration and practical intelligence together in one workspace.</p></div><Link to="/request-access" className="inline-flex min-h-12 shrink-0 items-center gap-3 rounded-md bg-white px-5 text-sm font-semibold text-[#164e82] transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">Explore Solution Velocity <ArrowRight className="h-4 w-4" /></Link></div></section>
      </main>
      <footer className="border-t border-slate-200 bg-white px-5 py-8 sm:px-8 lg:px-12"><div className="mx-auto flex max-w-[1184px] flex-col justify-between gap-4 text-xs text-slate-500 sm:flex-row sm:items-center"><div className="flex items-center gap-2 font-semibold text-[#17365e]"><Package className="h-4 w-4 text-[#307ba9]" /> Solution Velocity</div><p>Connect the tools. Accelerate the build.</p><div className="flex gap-5"><Link to="/login" className="hover:text-blue-700">Sign in</Link><Link to="/request-access" className="hover:text-blue-700">Request access</Link></div></div></footer>
    </div>
  );
}
