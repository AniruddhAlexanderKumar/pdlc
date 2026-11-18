import { useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  ChevronRight,
  Clock3,
  FileText,
  Layers3,
  Route
} from 'lucide-react';
import { CHAPTER_BRIEFS, PATH_STAGES, questionsForStage, STAGE_GUIDES } from '@sv/shared';
import { BuildPlate } from '../journey/BuildPlate';
import { stageIcon } from '../journey/JourneyMap';

/** Public curriculum preview. No invented user, XP, sample progress or account writes. */
export function FounderFieldGuide() {
  const [stage, setStage] = useState<(typeof PATH_STAGES)[number]>('Idea');
  const i = PATH_STAGES.indexOf(stage),
    q = questionsForStage(stage)[0];
  return (
    <>
      <section className="field-cover border-b border-[#d4dedc] px-5 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1200px] items-center gap-10 py-12 md:grid-cols-[1.05fr_1fr] md:py-16 lg:gap-16 lg:py-[70px]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[#c7d9d5] bg-white/80 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[.13em] text-[#366b65]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#40857a]" /> The founder workspace
            </p>
            <h1 className="mt-5 text-[clamp(3.1rem,5.55vw,5.35rem)] font-semibold leading-[.99] tracking-[-.065em] text-[#153948]">
              From an idea
              <br />
              to <span className="font-serif font-normal italic tracking-[-.055em] text-[#35776e]">a product.</span>
            </h1>
            <p className="mt-5 max-w-[31rem] text-[16px] leading-[1.7] text-[#50656c] sm:text-[17px]">
              Build something real, one useful step at a time. A guided workspace for turning your first idea into a
              researched, tested product.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-4">
              <Link to="/signup" className="sv-primary-link">
                Start building <ArrowRight size={16} />
              </Link>
              <Link
                to="/try-demo"
                className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c3d2d3] bg-white px-4 text-sm font-semibold text-[#254e5e] hover:border-[#69929a]"
              >
                Explore demo <ArrowUpRight size={15} />
              </Link>
            </div>
            <p className="mt-6 flex items-center gap-2 text-xs font-medium text-[#586e74]">
              <BookOpen size={15} className="text-[#39796f]" /> No product development experience needed
            </p>
          </div>
          <figure className="mx-auto w-full max-w-[540px] overflow-hidden rounded-xl border border-[#183f4b] bg-[#103442] text-white shadow-[0_16px_32px_-18px_rgba(21,61,67,.38)]">
            <div className="flex items-center justify-between border-b border-[#42646f] px-5 py-3.5 font-mono text-[10px] uppercase tracking-[.14em] text-[#c0dfdf]">
              <span className="inline-flex items-center gap-2">
                <Box size={14} /> Design notebook
              </span>
              <span className="text-[#9bbac0]">Plate / 001</span>
            </div>
            <div className="px-2">
              <BuildPlate />
            </div>
            <figcaption className="flex items-center justify-between gap-3 border-t border-[#42646f] px-5 py-4">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[.16em] text-[#b5d4d7]">Illustrated study</p>
                <p className="mt-1 text-sm font-medium">Anatomy of a prototype</p>
              </div>
              <span className="rounded border border-[#4e7379] px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-[#bce0d6]">
                Exploded view
              </span>
            </figcaption>
          </figure>
        </div>
      </section>
      <section aria-label="Guide at a glance" className="border-b border-[#d6e0df] bg-white px-5 sm:px-8 lg:px-12">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 divide-x divide-[#dde6e4] md:grid-cols-4">
          {(
            [
              [Route, '08 chapters', 'One connected journey'],
              [Clock3, '1–5 minutes', 'Typical activity'],
              [FileText, 'Living briefs', 'Built from your answers'],
              [Layers3, 'At your pace', 'Save, revisit, refine']
            ] as const
          ).map(([I, title, note], n) => (
            <div key={title} className={`flex items-center gap-3 py-5 ${n ? 'pl-3 sm:pl-6' : ''}`}>
              <I size={19} className="shrink-0 text-[#437a77]" />
              <div>
                <p className="text-sm font-semibold text-[#214654]">{title}</p>
                <p className="mt-0.5 text-[11px] text-[#667b80]">{note}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section id="field-guide" className="scroll-mt-32 bg-[#f8faf8] px-5 py-12 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1200px]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="sv-kicker !text-[#39736d]">The field guide</p>
              <h2 className="mt-2 text-[clamp(1.8rem,3.1vw,2.8rem)] font-semibold leading-tight tracking-[-.05em] text-[#153948]">
                Eight chapters. One clear next step.
              </h2>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-[.12em] text-[#607a7e]">
              Curriculum preview <ArrowDown size={12} className="inline" />
            </span>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" aria-label="Explore a chapter">
            {PATH_STAGES.map((s, n) => {
              const I = stageIcon(s),
                on = stage === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setStage(s)}
                  className={`rounded-lg border p-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 ${on ? 'border-[#38857a] bg-[#e3f1eb] text-[#24594f]' : 'border-[#d4dfde] bg-white text-[#46626b] hover:border-[#84aaa5]'}`}
                >
                  <span className="flex items-center justify-between">
                    <I size={19} />
                    <span className="font-mono text-[10px] opacity-75">{String(n + 1).padStart(2, '0')}</span>
                  </span>
                  <span className="mt-4 block text-[13px] font-semibold">{s}</span>
                </button>
              );
            })}
          </div>
          <div
            aria-live="polite"
            className="mt-3 grid gap-5 rounded-lg border border-[#d4dfde] bg-white p-5 sm:p-6 md:grid-cols-[1fr_1fr]"
          >
            <div>
              <p className="sv-kicker !text-[#39736d]">
                Chapter {String(i + 1).padStart(2, '0')} / {stage}
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">{STAGE_GUIDES[stage].purpose}</h3>
              <p className="mt-2 text-sm leading-6 text-[#596e74]">{STAGE_GUIDES[stage].why}</p>
            </div>
            <div className="border-t border-[#d8e2e0] pt-4 md:border-l md:border-t-0 md:pl-6 md:pt-0">
              <p className="flex items-center gap-2 text-xs font-semibold text-[#42766c]">
                <FileText size={14} /> You’ll create a {CHAPTER_BRIEFS[stage].toLowerCase()}
              </p>
              <p className="mt-2 text-sm">First activity: {q.prompt}</p>
              <Link to="/try-demo" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#166579]">
                Try the workspace <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
