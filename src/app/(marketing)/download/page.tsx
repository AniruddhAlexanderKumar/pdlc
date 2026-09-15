import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Download } from "lucide-react";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { CodeBlock } from "@/components/common/code-block";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/common/shell";

export const metadata: Metadata = {
  title: "Download",
  description: "Self-hosted deployment bundle for PDLC Platform — current version, checksum, and install guide.",
};

const BUNDLE_FILENAME = `pdlc-self-hosted-bundle-v${PRODUCT_VERSION}.zip`;
const BUNDLE_HREF = `/downloads/${BUNDLE_FILENAME}`;
// Computed directly from the published file — see the bundle's own build
// step. If the file changes, this line has to change with it; there is no
// mechanism yet that keeps this automatically in sync (stated in the docs
// footer's "known limitations" spirit, not hidden).
const SHA256 = "862E14C39CFD59B602624A5C0281BA9C540A46317091C4B08AACBC4DDDF50448";
const SIZE_BYTES = 6822;

export default function DownloadPage() {
  return (
    <Shell className="flex flex-col gap-10 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Download</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          There is no Windows-native installer yet. This is a real, working self-hosted deployment bundle —
          labelled for what it actually is, not for what it isn&apos;t.
        </p>
      </header>

      <section
        role="alert"
        className="flex items-start gap-3 rounded-lg border border-l-4 border-warning bg-warning/5 p-4"
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          A Windows-native installer (a signed <code className="font-mono">.msi</code>, a registered Windows
          Service, a bundled PostgreSQL) is a stated goal, not something that exists today. Building one
          honestly requires code-signing certificate procurement and testing across four Windows targets —
          real engineering work, not a packaging afternoon. This page will change, and a real
          &quot;Download for Windows&quot; button will only appear once that work is done.
        </p>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold text-foreground">Self-hosted bundle</h2>
            <p className="text-sm text-muted-foreground">
              v{PRODUCT_VERSION} · {(SIZE_BYTES / 1024).toFixed(1)} KB · released {new Date().toISOString().slice(0, 10)}
            </p>
          </div>
          <Button asChild size="lg">
            <a href={BUNDLE_HREF} download>
              <Download aria-hidden="true" />
              {BUNDLE_FILENAME}
            </a>
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">SHA-256</span>
          <CodeBlock>{SHA256}</CodeBlock>
          <p className="text-xs text-muted-foreground">
            Verify after download:{" "}
            <code className="font-mono">
              sha256sum {BUNDLE_FILENAME}
            </code>{" "}
            (Linux/macOS) or{" "}
            <code className="font-mono">Get-FileHash {BUNDLE_FILENAME}</code> (PowerShell), and compare
            against the value above.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">What the bundle does and does not do</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>
            Contains <code className="font-mono">docker-compose.prod.yml</code>,{" "}
            <code className="font-mono">.env.production.example</code>, and{" "}
            <code className="font-mono">setup.sh</code> — a configuration and setup kit, not a standalone
            binary.
          </li>
          <li>
            Does not embed the application source. <code className="font-mono">setup.sh</code> clones it
            from GitHub — the one network call the whole process makes, stated up front rather than left to
            discover. Already have the source checked out? Point the script at it with{" "}
            <code className="font-mono">--path</code> and it makes no network call at all.
          </li>
          <li>Does not install Docker, Node.js, or PostgreSQL — see requirements below.</li>
          <li>Does not configure a reverse proxy or TLS — that stays an operator step, documented in <code className="font-mono">DEPLOYMENT.md</code>.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">System requirements</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
          <li>Docker or Podman, with Compose v2 — any host that runs containers (Linux, macOS, Windows with Docker Desktop/WSL2).</li>
          <li>PostgreSQL 17 — provisioned for you by the bundle&apos;s own Compose file; no separate install needed.</li>
          <li><code className="font-mono">git</code>, unless you already have the source and use <code className="font-mono">--path</code>.</li>
          <li>No published disk/memory figures yet — not measured, not stated.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Install</h2>
        <CodeBlock>{`unzip ${BUNDLE_FILENAME}
cd pdlc-self-hosted-bundle-v${PRODUCT_VERSION}
chmod +x setup.sh
./setup.sh`}</CodeBlock>
        <p className="text-sm text-muted-foreground">
          Full walkthrough in{" "}
          <Link href="/docs/getting-started" className="underline-offset-4 hover:underline">
            Getting started
          </Link>
          .
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">Other ways to run it</h2>
        <p className="text-sm text-muted-foreground">
          If you&apos;d rather not use the bundle, the exact same three-command Docker Compose sequence it
          automates is documented directly in{" "}
          <Link href="/docs/deployment" className="underline-offset-4 hover:underline">
            Deployment
          </Link>
          . A dedicated single-tenant instance we run for you is a direction, not a shipping product today —
          nothing to sign up for yet.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-foreground">Licence</h2>
        <p className="text-sm text-muted-foreground">
          Licence terms have not been published yet. This section will state them plainly once they exist,
          rather than leaving the question unanswered indefinitely.
        </p>
      </section>
    </Shell>
  );
}
