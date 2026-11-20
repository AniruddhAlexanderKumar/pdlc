import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Link } from 'react-router';

export interface FaqItem {
  q: string;
  a: string;
  /** Short grouping label, shown as a filter chip. */
  category: 'Account' | 'Platform' | 'Journey' | 'Education' | 'Security' | 'Access & cost';
}

const CATEGORIES: FaqItem['category'][] = ['Account', 'Journey', 'Platform', 'Education', 'Security', 'Access & cost'];

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Searchable, grouped FAQ. Filters are plain client state — nothing is sent
 * anywhere — and every answer is always reachable by direct anchor so search
 * results and support replies can link to one question.
 */
export function FaqSection({ items }: { items: FaqItem[] }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<FaqItem['category'] | 'All'>('All');

  const visible = useMemo(() => {
    const needle = normalise(query);
    return items.filter((item) => {
      if (category !== 'All' && item.category !== category) return false;
      if (!needle) return true;
      return normalise(`${item.q} ${item.a} ${item.category}`).includes(needle);
    });
  }, [items, query, category]);

  const filtering = query.trim() !== '' || category !== 'All';

  return <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-32 bg-white px-5 py-16 sm:px-8 sm:py-20 lg:scroll-mt-24 lg:px-12 lg:py-24">
    <div className="mx-auto grid max-w-[1224px] gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#287b9a]">Questions</p>
        <h2 id="faq-heading" className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.04em] text-[#102f46] sm:text-4xl">A few things to know.</h2>
        <p className="mt-4 max-w-sm text-sm leading-7 text-slate-600">Filter by topic or search the answers. Still stuck? The team is reachable through the contact page.</p>
        <Link to="/request-access" className="mt-5 inline-flex text-sm font-semibold text-[#216f92] hover:text-[#113e59]">Contact the team →</Link>
      </div>

      <div>
        <div className="border border-[#d9e6ea] bg-[#f8fbfc] p-3">
          <label className="relative block">
            <span className="sr-only">Search questions</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search questions, e.g. “payment” or “voice”"
              className="min-h-11 w-full border border-[#cbdbe2] bg-white pl-9 pr-9 text-sm text-[#17384e] placeholder:text-slate-400 focus:border-[#377e9d] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2b799d]/40"
            />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-slate-400 hover:text-slate-700"><X className="h-4 w-4" aria-hidden="true" /></button>}
          </label>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter questions by topic">
            {(['All', ...CATEGORIES] as const).map((item) => <button
              key={item}
              type="button"
              aria-pressed={category === item}
              onClick={() => setCategory(item)}
              className={`min-h-8 border px-2.5 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2b799d] ${category === item ? 'border-[#2b799d] bg-[#153f5d] text-white' : 'border-[#cbdbe2] bg-white text-[#35576a] hover:border-[#9dc2d1]'}`}
            >{item}</button>)}
          </div>
        </div>

        <p className="mt-4 text-xs font-semibold text-slate-500" role="status" aria-live="polite">
          {filtering ? `${visible.length} of ${items.length} questions` : `${items.length} questions`}
        </p>

        {visible.length === 0 && <div className="mt-4 border border-dashed border-[#cbdbe2] bg-[#f8fbfc] p-6 text-center">
          <p className="text-sm font-semibold text-[#17384e]">No questions match “{query || category}”.</p>
          <p className="mt-1 text-sm text-slate-600">Try a shorter search, or <button type="button" onClick={() => { setQuery(''); setCategory('All'); }} className="font-semibold text-[#216f92] underline">clear the filters</button>.</p>
        </div>}

        <div className="mt-2">
          {visible.map((item) => <details key={item.q} className="group border-t border-[#dbe6ea] py-5 last:border-b">
            <summary className="flex cursor-pointer list-none items-start justify-between gap-4 text-base font-semibold text-[#173b52] marker:content-none">
              <span className="min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-[#2c6d85]">{item.category}</span>
                {item.q}
              </span>
              <span className="mt-4 text-lg font-normal leading-none text-[#2d7f9e] group-open:hidden" aria-hidden="true">+</span>
              <span className="mt-4 hidden text-lg font-normal leading-none text-[#2d7f9e] group-open:inline" aria-hidden="true">−</span>
            </summary>
            <p className="max-w-2xl pt-3 text-sm leading-7 text-slate-600">{item.a}</p>
          </details>)}
        </div>
      </div>
    </div>
  </section>;
}
