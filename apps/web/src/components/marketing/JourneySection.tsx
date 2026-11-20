import { useState } from 'react';
import { ArrowRight, BadgeCheck, Beaker, Boxes, ClipboardList, Lightbulb, Megaphone, PenTool, Rocket, Search, Sparkles, Star, Trophy, Zap } from 'lucide-react';
import { Link } from 'react-router';
import { WORLDS, type StageId } from '@sv/shared';

/**
 * Presentation for each lifecycle world. The route itself comes from `WORLDS`
 * in `@sv/shared`, so this page can never advertise a path the product does
 * not actually teach — only the icon and colour live here.
 */
const WORLD_STYLE: Record<StageId, { icon: typeof Lightbulb; tone: string }> = {
  Idea: { icon: Lightbulb, tone: 'bg-amber-500' },
  Research: { icon: Search, tone: 'bg-sky-600' },
  Planning: { icon: ClipboardList, tone: 'bg-indigo-600' },
  Design: { icon: PenTool, tone: 'bg-fuchsia-600' },
  Prototype: { icon: Boxes, tone: 'bg-[#16598d]' },
  Testing: { icon: Beaker, tone: 'bg-teal-600' },
  Launch: { icon: Rocket, tone: 'bg-rose-600' },
  Improvement: { icon: Megaphone, tone: 'bg-emerald-600' },
  Retired: { icon: Star, tone: 'bg-slate-400' }
};

/** The eight worlds a product can journey through, in curriculum order. */
const PATH = WORLDS.map((world) => ({ world, style: WORLD_STYLE[world.stage] }));

const lessonCount = (world: (typeof WORLDS)[number]) => world.units.reduce((total, unit) => total + unit.lessons.length, 0);

export function JourneySection() {
  const [activeStage, setActiveStage] = useState<StageId>(WORLDS[0].stage);
  const active = PATH.find(({ world }) => world.stage === activeStage) ?? PATH[0];
  const ActiveIcon = active.style.icon;

  return <section id="journey" aria-labelledby="journey-heading" className="scroll-mt-32 overflow-hidden border-b border-[#dbe6ea] bg-[#f7fafb] px-5 py-16 sm:px-8 sm:py-20 lg:scroll-mt-24 lg:px-12 lg:py-24">
    <div className="mx-auto max-w-[1224px]">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr] lg:items-end lg:gap-20">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#287b9a]">The guided journey</p>
          <h2 id="journey-heading" className="mt-4 max-w-2xl text-3xl font-semibold leading-[1.1] tracking-[-0.04em] text-[#102f46] sm:text-4xl lg:text-5xl">Eight worlds, from first idea to real improvement.</h2>
        </div>
        <p className="max-w-lg text-base leading-7 text-slate-600 lg:justify-self-end">Every product starts at World 1. Each world has lessons, hands-on work on your own product, a unit review and a checkpoint before the path opens any further.</p>
      </div>

      {/* The path: a route you can read at a glance, and step through. */}
      <ol className="mt-10 grid gap-2 sm:grid-cols-2 lg:mt-12 lg:grid-cols-8 lg:gap-0" aria-label="The eight worlds">
        {PATH.map(({ world, style }, index) => {
          const Icon = style.icon;
          const isActive = world.stage === activeStage;
          return <li key={world.id} className="min-w-0 lg:relative">
            <button
              type="button"
              onClick={() => setActiveStage(world.stage)}
              aria-pressed={isActive}
              className={`flex min-h-14 w-full items-center gap-3 border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2b799d] lg:h-full lg:flex-col lg:items-start lg:border-0 lg:border-t-2 lg:px-2 lg:pb-4 lg:pt-4 ${isActive ? 'border-[#2b799d] bg-white lg:border-t-[#2b799d]' : 'border-[#dbe6ea] bg-white/60 hover:border-[#9dc2d1] hover:bg-white lg:border-t-[#d3e0e5] lg:hover:bg-white/70'}`}
            >
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${style.tone} ${isActive ? '' : 'opacity-80'}`}><Icon className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0">
                <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[#456070]">World {index + 1}</span>
                <span className={`mt-0.5 block text-sm font-semibold ${isActive ? 'text-[#123c55]' : 'text-[#35576a]'}`}>{world.title}</span>
              </span>
            </button>
          </li>;
        })}
      </ol>

      {/* Detail for the selected world, read straight from the curriculum. */}
      <div className="mt-6 border border-[#d6e5e9] bg-white p-6 sm:p-8 lg:mt-8">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:gap-12">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${active.style.tone}`}><ActiveIcon className="h-5 w-5" aria-hidden="true" /></span>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#287b9a]">World {active.world.index} of {PATH.length} · {active.world.title}</p>
            </div>
            <h3 className="mt-4 text-2xl font-semibold tracking-tight text-[#102f46]">{active.world.blurb}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">By the end of this world: {active.world.outcome}</p>
            <dl className="mt-6 grid max-w-md grid-cols-3 gap-3 border-t border-[#e2ecee] pt-5">
              <div><dt className="text-xs text-slate-500">Units</dt><dd className="mt-1 text-lg font-semibold text-[#15384f]">{active.world.units.length}</dd></div>
              <div><dt className="text-xs text-slate-500">Lessons</dt><dd className="mt-1 text-lg font-semibold text-[#15384f]">{lessonCount(active.world)}</dd></div>
              <div><dt className="text-xs text-slate-500">Checkpoint</dt><dd className="mt-1 max-w-[9rem] text-sm font-semibold leading-5 text-[#15384f]">{active.world.checkpoint.title}</dd></div>
            </dl>
          </div>
          <div className="border-t border-[#e2ecee] pt-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#456070]">Inside this world</p>
            <ul className="mt-3 space-y-2.5">
              {active.world.units.map((unit) => <li key={unit.id} className="flex gap-2.5 text-sm leading-6 text-[#355368]"><BadgeCheck className="mt-1 h-4 w-4 shrink-0 text-[#2a89a4]" aria-hidden="true" />{unit.title}</li>)}
            </ul>
            <Link to="/signup" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#216f92] hover:text-[#113e59]">Start World 1 <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
        </div>
      </div>

      {/* Gamification is a real part of the product, so the page names it plainly. */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Zap, title: 'Progress you can feel', text: 'Lessons, completed answers, finished tasks and checkpoints earn XP towards your next level.' },
          { icon: Trophy, title: 'Titles and achievements', text: 'Level titles track how far you have come, and achievements mark the milestones on the way.' },
          { icon: Sparkles, title: 'Stage quests', text: 'Each world pairs its lessons with guided work on your own product, reviewed against the same criteria as a checkpoint.' }
        ].map(({ icon: Icon, title, text }) => <article key={title} className="border border-[#d9e6ea] bg-white p-6"><Icon className="h-5 w-5 text-[#27839b]" aria-hidden="true" /><h3 className="mt-3 text-base font-semibold text-[#15384f]">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{text}</p></article>)}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border border-[#cfe2e8] bg-[#eef7f9] px-5 py-4">
        <p className="inline-flex items-center gap-2 text-sm text-[#2c556b]"><Star className="h-4 w-4 shrink-0 text-[#2a89a4]" aria-hidden="true" /> Score points are for motivation, never a substitute for engineering judgement.</p>
        <Link to="/try-demo" className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#216f92] hover:text-[#113e59]">Walk the path in the demo <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </div>
      <p className="mt-4 text-xs leading-5 text-slate-500">The journey is the product's home screen after you sign in. Lessons are written guidance; checkpoints and quests are reviewed against each world's criteria. Optional assistant answers depend on deployment configuration, and score points are not a certification.</p>
    </div>
  </section>;
}
