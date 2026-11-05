import { ArrowRight, BookOpenCheck, GitBranch, Share2, Users } from 'lucide-react';
import { Link } from 'react-router';
import { educationPreview } from '../../lib/marketing/education';

const formatPrice = (cents: number | null) => cents === null ? 'Custom' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

export function EducationSection() {
  const { studentCents, cohortCents, commercialCents, savings } = educationPreview();
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
          <div className="flex items-center justify-between gap-3 border-b border-white/15 pb-5"><p className="text-xs font-bold uppercase tracking-[0.14em] text-[#a9dce5]">Education pricing estimates</p><GitBranch className="h-5 w-5 text-[#8bd3dc]" aria-hidden="true" /></div>
          <div className="grid gap-6 py-7 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div><p className="text-sm font-semibold text-[#c4dce4]">Individual student</p><p className="mt-2 text-4xl font-semibold tracking-tight">{formatPrice(studentCents)}<span className="ml-1 text-sm font-medium tracking-normal text-[#bad1da]">/ month</span></p><p className="mt-2 text-xs leading-5 text-[#b6ced7]">One student · monthly billing</p></div>
            <div><p className="text-sm font-semibold text-[#c4dce4]">School / institutional cohort</p><p className="mt-2 text-4xl font-semibold tracking-tight">{formatPrice(cohortCents)}<span className="ml-1 text-sm font-medium tracking-normal text-[#bad1da]">/ student / month</span></p><p className="mt-2 text-xs leading-5 text-[#b6ced7]">10–100 students · eligibility reviewed</p></div>
          </div>
          {savings !== null && <p className="border-t border-white/15 pt-5 text-sm leading-6 text-[#d2e8ec]">The student monthly estimate is {savings}% less than our {formatPrice(commercialCents)} individual commercial monthly estimate.</p>}
          <p className="mt-4 text-xs leading-5 text-[#b6ced7]">Estimates in USD; taxes excluded. A request does not activate access, create a subscription or take payment. Education-specific roles, teacher dashboards, cohorts and licence management are not available today.</p>
          <Link to="/request-access?category=education" className="mt-7 inline-flex min-h-12 items-center justify-center gap-3 self-start bg-white px-5 text-sm font-semibold text-[#123f59] transition-colors hover:bg-[#e5f4f6] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Request education access <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
      </div>
    </div>
  </section>;
}
