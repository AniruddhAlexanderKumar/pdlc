/**
 * A small, hand-built, client-side search index — no third-party search
 * service (Pagefind, Algolia, or otherwise), consistent with the rest of
 * this product's no-third-party posture. Genuinely functional for a
 * documentation set this size; kept honest by only indexing pages that
 * actually exist (see docs-nav.ts) rather than the full aspirational
 * sitemap.
 */
export interface DocsSearchEntry {
  title: string;
  href: string;
  section: string;
  keywords: string;
}

export const DOCS_SEARCH_INDEX: DocsSearchEntry[] = [
  {
    title: "Getting started",
    href: "/docs/getting-started",
    section: "Getting started",
    keywords: "install docker self-hosted bundle first sign-in demo project organization",
  },
  {
    title: "Concepts",
    href: "/docs/concepts",
    section: "Concepts",
    keywords:
      "graph node edge determinism no scores baseline revision supersession lesson requirement append-only deletion transition lifecycle",
  },
  {
    title: "Deployment",
    href: "/docs/deployment",
    section: "Deployment",
    keywords: "docker compose environment variables backup restore upgrade migration health endpoints postgres",
  },
  {
    title: "Security",
    href: "/docs/security",
    section: "Security",
    keywords: "argon2id session authentication authorization idor audit log csp encryption threat model",
  },
  {
    title: "Known limitations",
    href: "/docs/known-limitations",
    section: "Known limitations",
    keywords: "rate limiting evidence storage file binary migration csp unsafe-inline single instance",
  },
  {
    title: "Release notes",
    href: "/docs/release-notes",
    section: "Release notes",
    keywords: "version changelog",
  },
];

export function searchDocs(query: string): DocsSearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return DOCS_SEARCH_INDEX.filter(
    (entry) =>
      entry.title.toLowerCase().includes(q) ||
      entry.section.toLowerCase().includes(q) ||
      entry.keywords.includes(q),
  );
}
