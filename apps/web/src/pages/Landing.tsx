import { ArrowDownRight, ArrowRight, BookOpen, CircleHelp, Compass, Package, Users } from 'lucide-react';
import { Link } from 'react-router';

const STAGES = ['Idea', 'Research', 'Planning', 'Design', 'Prototype', 'Testing', 'Launch', 'Improvement'];

const WORK_AREAS = [
  {
    number: '01',
    title: 'Product definition',
    detail: 'Keep the original idea, product details, and open questions together as the concept develops.'
  },
  {
    number: '02',
    title: 'Cost assumptions',
    detail: 'Bring materials, supplier prices, labour, packaging, and overhead into the same product view.'
  },
  {
    number: '03',
    title: 'Project work',
    detail: 'Connect the people, issues, and decisions involved in moving a product forward.'
  }
];

const HELP_STEPS = [
  {
    icon: Compass,
    title: 'Get oriented',
    detail: 'Open the demo to explore a read-only workspace with preset products, projects, issues, and contribution examples. No account is needed.'
  },
  {
    icon: Package,
    title: 'Start a product',
    detail: 'In your workspace, choose New product and add the idea and details you already know. Move through the lifecycle as the product develops; you do not need to complete every stage at once.'
  },
  {
    icon: ArrowDownRight,
    title: 'Add costs and suppliers',
    detail: 'Record materials and supplier quotes, then fill in labour, packaging, and overhead on the product cost sheet to understand its unit cost and margin.'
  },
  {
    icon: Users,
    title: 'Coordinate the work',
    detail: 'Create a project for delivery work, add issues, set status and priority, and assign a workspace member. Keep project work connected to the related product.'
  },
  {
    icon: CircleHelp,
    title: 'Find progress and settings',
    detail: 'Use Achievements to see your XP and progress. In Settings, manage your account, workspace, team, dashboard, theme, and language.'
  }
];

export function LandingPage() {
  return (
    <div className="min-h-full overflow-y-auto bg-[#f7f6f2] text-[#202b36] selection:bg-[#c7d9e8] selection:text-[#17365e]">
      <header className="border-b border-[#d9dedf] bg-[#f7f6f2]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-5 sm:px-8">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb]"
            aria-label="Solution Velocity home"
          >
            <img src="/solution-velocity-logo.png" alt="" className="h-9 w-[4.5rem] object-contain" />
            <span className="font-serif text-lg tracking-tight text-[#17365e] sm:text-xl">Solution Velocity</span>
          </Link>
          <nav className="flex items-center gap-5 text-sm" aria-label="Account and page navigation">
            <a href="#how-it-fits" className="hidden text-[#53616c] transition-colors hover:text-[#17365e] sm:inline">
              How it fits together
            </a>
            <a href="#help" className="hidden text-[#53616c] transition-colors hover:text-[#17365e] sm:inline">
              Help
            </a>
            <Link to="/demo" className="font-medium text-[#17365e] underline decoration-[#9baab3] underline-offset-4 hover:decoration-[#17365e]">
              Demo
            </Link>
            <Link to="/login" className="font-medium text-[#17365e] underline decoration-[#9baab3] underline-offset-4 hover:decoration-[#17365e]">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pb-24 sm:pt-24 lg:grid-cols-[1.25fr_0.75fr] lg:gap-20 lg:pt-28">
          <div className="max-w-3xl">
            <p className="mb-7 flex items-center gap-3 text-xs font-medium tracking-[0.16em] text-[#526b7c] uppercase">
              <span className="h-px w-8 bg-[#477895]" aria-hidden="true" />
              Connect the Tools. Accelerate the Build.
            </p>
            <h1 className="font-serif text-5xl font-normal leading-[1.05] tracking-[-0.045em] text-[#17365e] sm:text-6xl lg:text-7xl">
              Solution Velocity
            </h1>
            <p className="mt-8 max-w-2xl text-base leading-7 text-[#53616c] sm:text-lg sm:leading-8">
              Solution Velocity brings product details, cost assumptions, project work, and decisions into one
              workspace. The record stays useful as the product moves from an early idea toward launch.
            </p>
            <a
              href="#how-it-fits"
              className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-[#17365e] underline decoration-[#9baab3] underline-offset-4 transition-colors hover:decoration-[#17365e]"
            >
              See what stays connected <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <Link
              to="/demo"
              className="ml-6 mt-8 inline-flex items-center gap-2 text-sm font-medium text-[#17365e] underline decoration-[#9baab3] underline-offset-4 transition-colors hover:decoration-[#17365e]"
            >
              Explore the demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          <aside className="self-end border-l border-[#b8c5c9] pl-6 sm:pl-8 lg:mb-2" aria-label="Product lifecycle stages">
            <p className="mb-5 text-xs font-medium tracking-[0.14em] text-[#6b7880] uppercase">A working path, not a fixed recipe</p>
            <ol className="space-y-0">
              {STAGES.map((stage, index) => (
                <li key={stage} className="flex items-baseline gap-4 border-b border-[#d9dedf] py-2.5 last:border-0">
                  <span className="w-6 font-mono text-[11px] text-[#71808a]">{String(index + 1).padStart(2, '0')}</span>
                  <span className={index === 0 || index === STAGES.length - 1 ? 'font-medium text-[#17365e]' : 'text-[#53616c]'}>
                    {stage}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-5 max-w-xs text-xs leading-5 text-[#6b7880]">
              Products can take different routes. Keep the stages visible and work at the pace the project needs.
            </p>
          </aside>
        </section>

        <section id="how-it-fits" className="scroll-mt-8 border-y border-[#d9dedf] bg-[#fffefa]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
            <div className="max-w-md">
              <p className="text-xs font-medium tracking-[0.16em] text-[#526b7c] uppercase">Keep context with the work</p>
              <h2 className="mt-5 font-serif text-4xl font-normal leading-tight tracking-[-0.035em] text-[#17365e] sm:text-5xl">
                Make the next decision with the whole picture in view.
              </h2>
              <p className="mt-6 text-sm leading-7 text-[#53616c] sm:text-base">
                Product questions, changing costs, and project decisions affect one another. Keep the important
                details close instead of scattering them across disconnected records.
              </p>
            </div>
            <div className="divide-y divide-[#d9dedf] border-y border-[#d9dedf]">
              {WORK_AREAS.map((area) => (
                <article key={area.number} className="grid gap-3 py-6 sm:grid-cols-[4rem_0.75fr_1.25fr] sm:gap-5 sm:py-7">
                  <span className="font-mono text-xs text-[#71808a]">{area.number}</span>
                  <h3 className="font-serif text-xl text-[#17365e]">{area.title}</h3>
                  <p className="max-w-lg text-sm leading-6 text-[#53616c]">{area.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="help" className="scroll-mt-8 border-y border-[#d9dedf] bg-[#f0f2ef]">
          <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
            <div className="max-w-md">
              <p className="flex items-center gap-2 text-xs font-medium tracking-[0.16em] text-[#526b7c] uppercase">
                <BookOpen className="h-4 w-4" aria-hidden="true" /> Help and getting started
              </p>
              <h2 className="mt-5 font-serif text-4xl font-normal leading-tight tracking-[-0.035em] text-[#17365e] sm:text-5xl">
                Find your way around the workspace.
              </h2>
              <p className="mt-6 text-sm leading-7 text-[#53616c] sm:text-base">
                Start with the demo, then follow these steps when you are ready to use your own workspace. You can
                add detail as you learn; you do not need a finished plan before getting started.
              </p>
              <Link
                to="/demo"
                className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#17365e] px-5 py-2.5 text-sm font-medium text-[#17365e] transition-colors hover:bg-[#17365e] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              >
                Open the preset-data demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <ol className="divide-y divide-[#cfd6d5] border-y border-[#cfd6d5]">
              {HELP_STEPS.map(({ icon: Icon, title, detail }, index) => (
                <li key={title} className="grid gap-3 py-5 sm:grid-cols-[2.5rem_0.7fr_1.3fr] sm:items-start sm:gap-5 sm:py-6">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#b8c5c9] text-[#477895]" aria-hidden="true">
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="pt-1 font-serif text-lg text-[#17365e]">
                    <span className="mr-2 font-mono text-[11px] text-[#71808a]">{String(index + 1).padStart(2, '0')}</span>
                    {title}
                  </h3>
                  <p className="text-sm leading-6 text-[#53616c]">{detail}</p>
                </li>
              ))}
            </ol>
          </div>
          <div className="mx-auto max-w-7xl px-5 pb-12 sm:px-8 sm:pb-16 lg:pl-[calc((100%-7rem)/3)]">
            <p className="max-w-3xl border-l-2 border-[#9baab3] pl-4 text-xs leading-5 text-[#6b7880]">
              Contribution tracking depends on workspace size: smaller teams use XP to follow personal activity
              consistency; reviewed contribution scoring is available when a workspace has more than two members.
              Demo records are fictional, read-only examples.
            </p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:items-start lg:gap-24">
            <div>
              <p className="text-xs font-medium tracking-[0.16em] text-[#526b7c] uppercase">Made for real product work</p>
              <h2 className="mt-5 max-w-sm font-serif text-3xl font-normal leading-tight tracking-[-0.03em] text-[#17365e] sm:text-4xl">
                Follow the product, not a template.
              </h2>
            </div>
            <div className="max-w-2xl space-y-5 text-sm leading-7 text-[#53616c] sm:text-base">
              <p>
                Some products need careful research before anyone can estimate a cost. Others move quickly into a
                prototype. Your team can follow the stages that fit the work instead of forcing every project into
                the same sequence.
              </p>
              <p>
                Track materials and suppliers beside product details, review project issues with their context,
                and keep the reasoning behind a decision available to the people doing the work.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-[#d9dedf] bg-[#e9eef0]">
          <div className="mx-auto grid max-w-7xl gap-8 px-5 py-14 sm:px-8 sm:py-16 md:grid-cols-[1fr_auto] md:items-center">
            <div className="max-w-2xl">
              <p className="text-xs font-medium tracking-[0.16em] text-[#526b7c] uppercase">Take a closer look</p>
              <h2 className="mt-4 font-serif text-3xl font-normal tracking-[-0.03em] text-[#17365e] sm:text-4xl">
                See whether it fits the way your team works.
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#53616c]">
                Request access to explore the workspace with your own product development process.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 md:justify-self-end">
              <Link
                to="/request-access"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#17365e] px-5 py-2.5 text-sm font-medium text-[#17365e] transition-colors hover:bg-[#17365e] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              >
                Request access <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#9baab3] px-5 py-2.5 text-sm font-medium text-[#31577d] transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              >
                Explore demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#d9dedf] bg-[#f7f6f2]">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-5 py-7 text-xs text-[#6b7880] sm:flex-row sm:items-center sm:px-8">
          <span className="font-medium text-[#31577d]">Solution Velocity · Product work, kept in context.</span>
          <div className="flex gap-5">
            <Link to="/demo" className="underline decoration-[#9baab3] underline-offset-4 hover:text-[#17365e]">Demo</Link>
            <Link to="/login" className="underline decoration-[#9baab3] underline-offset-4 hover:text-[#17365e]">
              Sign in to your workspace
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
