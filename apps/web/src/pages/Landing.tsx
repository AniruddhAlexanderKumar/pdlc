import { ArrowDown, ArrowRight, Check, Lightbulb, LineChart, Sparkles } from 'lucide-react';
import { Link } from 'react-router';

const JOURNEY = [
  { title: 'Tell us', detail: 'Shape the idea and capture the things worth knowing.', icon: Lightbulb },
  { title: 'Track it', detail: 'Bring materials, time, and costs into one clear view.', icon: LineChart },
  { title: 'Improve it', detail: 'Find a useful next step and keep making progress.', icon: Sparkles }
] as const;

const STAGES = ['Idea', 'Research', 'Planning', 'Design', 'Prototype', 'Testing', 'Launch', 'Improvement'];

function PrimaryCta({ children }: { children: string }) {
  return (
    <Link
      to="/request-access"
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#123c70] via-[#1266a4] to-[#159bd0] px-6 py-3 text-sm font-medium text-white shadow-md shadow-blue-900/15 transition-all hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
    >
      {children}
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </Link>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-full overflow-y-auto bg-gradient-to-br from-white via-[#f2f8ff] to-[#e6f2ff] text-[#17365e] selection:bg-[#bfdbfe] selection:text-[#123c70]">
      <header className="sticky top-0 z-20 border-b border-blue-100/90 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            to="/"
            className="flex items-center gap-3 rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563eb]"
            aria-label="Solution Velocity home"
          >
            <img
              src="/solution-velocity-logo.png"
              alt="Solution Velocity"
              className="h-9 w-[4.5rem] object-contain sm:h-11 sm:w-[5.5rem]"
            />
            <span className="hidden font-serif text-lg tracking-tight text-[#17365e] sm:inline sm:text-xl">
              Solution Velocity
            </span>
          </Link>

          <nav className="flex items-center gap-2 text-sm" aria-label="Account">
            <Link
              to="/login"
              className="rounded-full px-4 py-2.5 font-medium text-[#526b88] transition-colors hover:bg-blue-50 hover:text-[#17365e] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            >
              Sign in
            </Link>
            <Link
              to="/request-access"
              className="rounded-full bg-gradient-to-r from-[#123c70] to-[#168ac2] px-4 py-2.5 font-medium text-white shadow-sm transition-all hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
            >
              Request access
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-blue-100 bg-gradient-to-br from-white via-[#f3f8ff] to-[#e4f1ff] px-5 py-20 sm:px-8 sm:py-28 lg:py-32">
          <div className="pointer-events-none absolute -left-40 top-8 h-96 w-96 rounded-full bg-blue-200/50 blur-3xl" />
          <div className="pointer-events-none absolute -right-36 bottom-0 h-96 w-96 rounded-full bg-cyan-200/40 blur-3xl" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="max-w-2xl">
              <p className="mb-6 flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-blue-700 uppercase">
                <span className="h-px w-8 bg-blue-500" />
                Connect the Tools. Accelerate the Build.
              </p>
              <h1 className="font-serif text-5xl font-normal leading-[1.04] tracking-[-0.045em] text-[#102f55] sm:text-6xl lg:text-7xl">
                Make your next
                <br />
                <span className="bg-gradient-to-r from-[#123c70] via-[#1677b9] to-[#16a4d3] bg-clip-text italic text-transparent">
                  good idea real.
                </span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-[#526b88] sm:text-lg sm:leading-8">
                Solution Velocity helps you bring a product to life, keep its costs in view, and find
                a clear next step—without losing the thread along the way.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <PrimaryCta>Request access</PrimaryCta>
                <a
                  href="#the-journey"
                  className="inline-flex min-h-12 items-center gap-2 rounded-full px-5 text-sm font-medium text-[#31577d] transition-colors hover:bg-blue-100/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
                >
                  Explore the journey <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
              <p className="mt-6 text-xs tracking-wide text-[#6b7f99]">
                Ideas, product details, costs, and next steps—together.
              </p>
            </div>

            <div className="relative mx-auto w-full max-w-lg">
              <div className="absolute -right-5 -top-5 h-28 w-28 rounded-full bg-blue-300/50 blur-2xl" />
              <div className="absolute -bottom-6 -left-6 h-32 w-32 rounded-full bg-cyan-200/60 blur-2xl" />
              <div className="relative rounded-[2rem] border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/90 p-5 shadow-[0_28px_72px_-48px_rgba(30,64,110,0.38)] sm:p-7">
                <div className="flex items-start justify-between gap-4 border-b border-blue-100 pb-5">
                  <div>
                    <p className="text-xs tracking-[0.16em] text-[#66809f] uppercase">Your product journey</p>
                    <h2 className="mt-1 font-serif text-2xl text-[#17365e]">One step at a time</h2>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-50 to-blue-100 text-[#2563eb]">
                    <Sparkles className="h-4.5 w-4.5" aria-hidden="true" />
                  </span>
                </div>

                <div className="relative mt-5 space-y-3">
                  <div className="absolute bottom-8 left-5 top-8 w-px bg-blue-200" aria-hidden="true" />
                  {JOURNEY.map(({ title, detail, icon: Icon }, index) => (
                    <div
                      key={title}
                      className="relative flex items-center gap-4 rounded-2xl border border-blue-100 bg-gradient-to-br from-white to-blue-50/60 p-4 transition-colors hover:border-blue-300"
                    >
                      <span className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-gradient-to-br from-white to-blue-100 text-[#2563eb]">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold text-[#1e3a5f]">
                          {title}
                          {index === 0 && <Check className="h-3.5 w-3.5 text-blue-600" aria-label="Started" />}
                        </span>
                        <span className="mt-1 block text-xs leading-5 text-[#6b7f99]">{detail}</span>
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-5 border-t border-blue-100 pt-4 text-xs leading-5 text-[#647b96]">
                  A little more clarity at every stage, from the first idea to ongoing improvement.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="the-journey" className="scroll-mt-24 bg-gradient-to-b from-white to-blue-50/80 px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="text-xs font-semibold tracking-[0.2em] text-blue-700 uppercase">
                A simple rhythm for meaningful progress
              </p>
              <h2 className="mt-4 font-serif text-4xl tracking-[-0.035em] text-[#102f55] sm:text-5xl">
                Tell us. Track it. Improve it.
              </h2>
              <p className="mt-4 text-sm leading-7 text-[#526b88] sm:text-base">
                A product has many moving parts. Keep the important ones close, and make the next
                decision with a little more confidence.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {JOURNEY.map(({ title, detail, icon: Icon }, index) => (
                <article
                  key={title}
                  className="group rounded-3xl border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/80 p-7 transition-all duration-300 hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-900/5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-serif text-sm italic text-blue-700">0{index + 1}</span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 transition-transform duration-300 group-hover:rotate-[-6deg]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                  <h3 className="mt-8 font-serif text-2xl text-[#17365e]">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#526b88]">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-blue-100 bg-gradient-to-br from-[#eef6ff] via-white to-[#e3f1ff] px-5 py-16 sm:px-8 sm:py-20">
          <div className="mx-auto max-w-6xl">
            <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:items-center">
              <div>
                <p className="text-xs font-semibold tracking-[0.2em] text-blue-700 uppercase">
                  Keep the whole path in view
                </p>
                <h2 className="mt-4 font-serif text-3xl tracking-[-0.03em] text-[#102f55] sm:text-4xl">
                  From a spark to the next version.
                </h2>
                <p className="mt-4 text-sm leading-7 text-[#526b88]">
                  Move through the stages in your own time. Capture what you learn, keep an eye on
                  the numbers, and make room for what you discover.
                </p>
              </div>
              <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-white to-blue-50 p-5 sm:p-7">
                <ol className="flex flex-wrap gap-2" aria-label="Product lifecycle stages">
                  {STAGES.map((stage, index) => (
                    <li
                      key={stage}
                      className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3.5 py-2 text-xs text-[#31577d]"
                    >
                      <span className="font-serif italic text-blue-700">{String(index + 1).padStart(2, '0')}</span>
                      {stage}
                    </li>
                  ))}
                </ol>
                <p className="mt-5 border-t border-blue-100 pt-4 text-xs leading-5 text-[#647b96]">
                  Capture answers and earn progress as each part of your product story takes shape.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-b from-blue-50/80 via-white to-[#e8f4ff] px-5 py-24 text-center sm:px-8 sm:py-32">
          <div className="mx-auto max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-medium text-blue-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Small steps, considered together
            </span>
            <h2 className="mt-6 font-serif text-4xl leading-tight tracking-[-0.04em] text-[#102f55] sm:text-6xl">
              Give your next good idea a place to grow.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#526b88]">
              Start with what you know. Shape the product as you go. Keep the next step within reach.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <PrimaryCta>Request access</PrimaryCta>
              <Link
                to="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-full border border-blue-200 px-6 py-3 text-sm font-medium text-[#31577d] transition-colors hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563eb]"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-blue-100 bg-gradient-to-r from-white to-blue-50 px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-[#647b96] sm:flex-row">
          <span className="font-medium text-[#31577d]">Solution Velocity · Connect the Tools. Accelerate the Build.</span>
          <Link to="/login" className="transition-colors hover:text-[#17365e]">
            Sign in to your workspace
          </Link>
        </div>
      </footer>
    </div>
  );
}
