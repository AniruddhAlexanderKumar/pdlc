import type { Metadata } from "next";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { DocsPage } from "../_components/docs-page";

export const metadata: Metadata = {
  title: "Release notes",
  description: "What changed, by version.",
};

export default function ReleaseNotesPage() {
  return (
    <DocsPage
      title="Release notes"
      description="Pre-release. There is one version so far — this page grows with real entries, not backfilled ones."
      lastUpdated="2026-09-15"
      sourcePath="src/app/(marketing)/docs/release-notes/page.tsx"
    >
      <section className="flex flex-col gap-3">
        <h2>
          v{PRODUCT_VERSION} <span className="text-sm font-normal text-muted-foreground">— current</span>
        </h2>
        <p>
          Pre-release. No tagged releases exist yet in the repository&apos;s history — this version number is
          the current state of <code className="font-mono">main</code>, not a cut, published release. This
          page will carry a real entry per tagged version once one exists, rather than a fabricated history
          before that.
        </p>
      </section>
    </DocsPage>
  );
}
