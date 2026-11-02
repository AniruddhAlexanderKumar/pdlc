import { Link } from 'react-router';

export function PublicBrand() {
  return <Link to="/" className="inline-flex shrink-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-600" aria-label="Solution Velocity home"><img src="/solution-velocity-logo.png" alt="" className="h-8 w-10 object-contain sm:w-14" /><span className="border-l border-slate-200 pl-3 text-[13px] font-semibold leading-[1.05] tracking-tight text-[#143850]">Solution<br /><span className="font-normal">Velocity</span></span></Link>;
}
