/**
 * The real, working docs sidebar — every entry here is a page that exists.
 * Master Prompt 6's full sitemap (a page per module, per engine, per admin
 * concern) is not built yet; listing those as sidebar links before they
 * exist would be a broken promise on a page about not making broken
 * promises. See the docs index page's own note on what is intentionally
 * not written yet.
 */
export interface DocsNavItem {
  title: string;
  href: string;
}

export const DOCS_NAV: DocsNavItem[] = [
  { title: "Beginner guide", href: "/docs/beginner-guide" },
  { title: "Getting started", href: "/docs/getting-started" },
  { title: "Concepts", href: "/docs/concepts" },
  { title: "Deployment", href: "/docs/deployment" },
  { title: "Security", href: "/docs/security" },
  { title: "Troubleshooting", href: "/docs/troubleshooting" },
  { title: "Known limitations", href: "/docs/known-limitations" },
  { title: "Release notes", href: "/docs/release-notes" },
];
