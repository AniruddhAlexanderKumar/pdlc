import { ArrowRight, BookOpenCheck, GitBranch, Share2, Users } from 'lucide-react';
import { Link } from 'react-router';

export function EducationSection() {
  return <section id="education" className="scroll-mt-32 overflow-hidden border-b border-[#d7e6ea] bg-[#f4f9fa] px-5 py-20 sm:px-8 lg:scroll-mt-24 lg:px-12 lg:py-24" aria-labelledby="education-heading">
    <div className="mx-auto max-w-[1224px]">
      <div className="grid gap-6 lg:grid-cols-[1fr_0.8fr] lg:items-end lg:gap-20">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#287b9a]">For students & educational organisations</p><h2 id="education-heading" className="mt-4 max-w-2xl text-3xl font-semibold leading-[1.1] tracking-[-0.04em] text-[#102f46] sm:text-4xl lg:text-5xl">Make room for the next big idea.</h2></div>
        <p className="max-w-lg text-base leading-7 text-slate-600 lg:justify-self-end">From individual projects to student teams, organise the work behind your ideas and practise the workflows engineering teams use.</p>
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="border border-[#d6e5e9] bg-white p-6 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#287b9a]">Make progress together</p>
          <div className="mt-3 divide-y divide-[#e2ecee]">
            <div className="flex gap-4 py-5"><BookOpenCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#2887a3]" /><div><h3 className="font-semibold text-[#153b51]">For students: build with structure</h3><p className="mt-2 text-sm leading-6 text-slate-600">Organise project issues and product tasks, and keep product details, materials and cost inputs in one workspace.</p></div></div>
            <div className="flex gap-4 py-5"><Users aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#2887a3]" /><div><h3 className="font-semibold text-[#153b51]">For student teams: see who is doing what</h3><p className="mt-2 text-sm leading-6 text-slate-600">Work in a shared workspace, assign project issues and use the Teamwork Graph to see recorded dependencies.</p></div></div>
            <div className="flex gap-4 py-5"><Share2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#2887a3]" /><div><h3 className="font-semibold text-[#153b51]">For mentors: share only what matters</h3><p className="mt-2 text-sm leading-6 text-slate-600">Share selected project issues with an external reviewer through a read-only link, without giving them workspace membership.</p></div></div>
          </div>
        </div>
        <div className="flex flex-col bg-[#10384e] p-6 text-white sm:p-8">
          <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#a9dce5]">Building your first product</p><GitBranch className="h-5 w-5 text-[#8bd3dc]" aria-hidden="true" /></div>
          <ol className="grid gap-5 py-7">
            {[
              ['1. Create your account', 'Your personal details, and a password of at least 10 characters.'],
              ['2. Name what you are building', 'Tell us the product and whether you are starting from scratch or already building.'],
              ['3. Enter the journey', 'Your product starts in the right stage of the lifecycle, with XP and stage quests from the first step.']
            ].map(([title, detail]) => <li key={title}><p className="text-sm font-semibold text-[#d7ecf1]">{title}</p><p className="mt-1 text-xs leading-5 text-[#b6ced7]">{detail}</p></li>)}
          </ol>
          <p className="mt-2 text-xs leading-5 text-[#b6ced7]">Education-specific roles, teacher dashboards, cohorts and licence management are not available today. Access is open during the launch period; no payment details are requested.</p>
          <Link to="/signup" className="mt-7 inline-flex min-h-12 items-center justify-center gap-3 self-start bg-white px-5 text-sm font-semibold text-[#123f59] transition-colors hover:bg-[#e5f4f6] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Get Started <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </div>
    </div>
  </section>;
}
