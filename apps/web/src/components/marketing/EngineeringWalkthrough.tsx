import { useState } from 'react';
import { ArrowRight, Check, ChevronRight, RotateCcw } from 'lucide-react';
import { SCENARIO_BY_ID, STEPS } from '../../lib/marketing/scenario';

export function EngineeringWalkthrough() {
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string>(STEPS[0].records[0]);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const current = STEPS[step];
  const record = SCENARIO_BY_ID[selected];
  const changeStep = (index: number) => { setStep(index); setSelected(STEPS[index].records[0]); };
  const selectRecord = (id: string) => { if (SCENARIO_BY_ID[id]) setSelected(id); };

  return <div className="overflow-hidden border border-slate-300/70 bg-white shadow-[0_22px_80px_-45px_rgba(13,37,62,0.35)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-[#f8fafb] px-5 py-4 sm:px-6">
      <div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-[#226387]">Interactive concept · fictional data</p><p className="mt-1 text-sm font-semibold text-slate-800">Actuator housing / change review</p></div>
      <span className="inline-flex items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800"><span className="h-1.5 w-1.5 rounded-full bg-amber-600" /> Release blocked</span>
    </div>
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="Walkthrough stages" className="min-w-0 border-b border-slate-200 bg-[#f8fafb] p-3 lg:border-b-0 lg:border-r">
        <ol className="flex gap-1 overflow-x-auto lg:flex-col">{STEPS.map((item, index) => <li key={item.title} className="min-w-[150px] flex-1 lg:min-w-0"><button type="button" aria-current={step === index ? 'step' : undefined} onClick={() => changeStep(index)} className={`flex min-h-11 w-full items-center gap-3 border-l-2 px-3 py-3 text-left text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${step === index ? 'border-[#22779f] bg-white text-[#143b5c]' : 'border-transparent text-slate-500 hover:bg-white hover:text-slate-800'}`}><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] ${reviewed.includes(index) ? 'border-teal-600 bg-teal-50 text-teal-700' : 'border-slate-300'}`}>{reviewed.includes(index) ? <Check className="h-3.5 w-3.5" /> : index + 1}</span>{item.title}</button></li>)}</ol>
      </nav>
      <div key={step} className="animate-rise min-w-0 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{current.title}</p><h3 className="mt-2 text-xl font-semibold tracking-tight text-[#102e49]">{current.summary}</h3></div><p className="text-xs text-slate-500">{reviewed.length} of {STEPS.length} stages reviewed</p></div>
        <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div><p className="mb-2 text-xs font-semibold text-slate-500">Select a record to inspect its context</p><div className="space-y-2">{current.records.map(id => { const item = SCENARIO_BY_ID[id]; return <button type="button" key={id} aria-pressed={selected === id} onClick={() => selectRecord(id)} className={`flex min-h-14 w-full items-center justify-between gap-3 border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${selected === id ? 'border-[#72a8c3] bg-[#f0f7fa]' : 'border-slate-200 bg-white hover:border-slate-400'}`}><span className="min-w-0"><span className="block text-[10px] font-bold uppercase tracking-wider text-[#33789c]">{item.id} · {item.kind}</span><span className="mt-1 block text-sm font-medium text-slate-800">{item.title}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-slate-400" /></button>; })}</div></div>
          <div aria-live="polite" className="min-w-0 border border-slate-200 bg-[#f8fafb] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold tracking-wider text-[#33789c]">{record.id} / {record.kind}</p><span className={`text-xs font-semibold ${record.status === 'Failed' || record.status === 'Blocked' ? 'text-rose-700' : record.status === 'Passed' ? 'text-teal-700' : 'text-slate-600'}`}>{record.status}</span></div><h4 className="mt-3 text-lg font-semibold text-[#102e49]">{record.title}</h4><p className="mt-2 text-sm leading-6 text-slate-600">{record.detail}</p><div className="mt-5 border-t border-slate-200 pt-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Related records</p><div className="mt-2 flex flex-wrap gap-2">{record.links.map(id => <button type="button" key={id} onClick={() => selectRecord(id)} className="border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#256c92] hover:border-blue-400 focus-visible:outline-2 focus-visible:outline-blue-600">{id}</button>)}</div></div></div>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5"><button type="button" onClick={() => setReviewed(old => old.includes(step) ? old.filter(i => i !== step) : [...old, step])} className="inline-flex min-h-10 items-center gap-2 border border-slate-300 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600">{reviewed.includes(step) ? 'Undo review' : 'Mark stage reviewed'} <Check className="h-3.5 w-3.5" /></button>{step < STEPS.length - 1 && <button type="button" onClick={() => changeStep(step + 1)} className="inline-flex min-h-10 items-center gap-2 px-2 text-xs font-semibold text-[#216b91] hover:text-blue-800 focus-visible:outline-2 focus-visible:outline-blue-600">Next stage <ArrowRight className="h-4 w-4" /></button>}<button type="button" onClick={() => { setReviewed([]); changeStep(0); }} className="ml-auto inline-flex min-h-10 items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"><RotateCcw className="h-3.5 w-3.5" /> Reset</button></div>
        <p className="mt-3 text-xs leading-5 text-slate-500">Review marks are local to this illustration. They do not change the failed result, approval or release status. Requirements, documents, verification and evidence records are planned, not available in the current app.</p>
      </div>
    </div>
  </div>;
}
