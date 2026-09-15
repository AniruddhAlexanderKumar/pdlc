import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { DocsPage } from "../_components/docs-page";

export const metadata: Metadata = {
  title: "Security",
  description: "Authentication, authorization, and data-integrity model — summarized from SECURITY.md.",
};

export default function SecurityDocsPage() {
  return (
    <DocsPage
      title="Security"
      description="A summary of SECURITY.md — the full document, with every claim linked to the code that makes it true, lives in the repository root."
      lastUpdated="2026-09-15"
      sourcePath="src/app/(marketing)/docs/security/page.tsx"
    >
      <section className="flex flex-col gap-3">
        <h2>Data ownership</h2>
        <p>
          Every piece of engineering data lives in the PostgreSQL database the operator provisions and
          controls. There is no managed database, no managed authentication provider, and no external API
          this system calls to do its job.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Authentication</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>
            Passwords hashed with Argon2id (<code className="font-mono">@node-rs/argon2</code>, in-process),
            at OWASP Password Storage Cheat Sheet parameters — 19 MiB memory, t=2, p=1.
          </li>
          <li>
            Sessions are opaque, 32 bytes of CSPRNG output — never a JWT. Only the SHA-256 hash of a token is
            ever persisted; a database dump yields no usable cookies.
          </li>
          <li>
            Sign-in performs a real Argon2id verification against a fixed decoy hash when no account exists,
            closing the timing gap that would otherwise leak which emails have accounts.
          </li>
          <li>Cookie is <code className="font-mono">httpOnly</code> + <code className="font-mono">SameSite=Lax</code>, <code className="font-mono">Secure</code> in production.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Authorization</h2>
        <p>
          Two independent axes, resolved server-side on every request: organization role
          (Owner/Member) and project role (Manager &gt; Engineer/Reviewer &gt; Viewer), the latter never
          inferred from the former. Every object lookup is scoped by both the caller&apos;s authorized
          project and the object&apos;s own id in the same query — an id belonging to a different project
          reads identically to one that does not exist.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Data integrity</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5">
          <li>Every mutation writes its audit row in the same database transaction as the mutation itself.</li>
          <li>
            Lifecycle transitions use a guarded conditional update — a concurrent transition of the same
            object cannot silently overwrite another; the loser gets a real conflict response.
          </li>
          <li>Every client-facing request schema rejects an unrecognized field outright rather than silently dropping it.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Certifications</h2>
        <p>
          <Badge variant="outline">No certification held</Badge> This codebase holds no compliance
          certification and claims none. Aerospace-domain terminology in this product — certification basis,
          compliance items, traceability — describes what the product helps an operator track about{" "}
          <em>their own</em> certification process. It is not a claim that this software has itself been
          certified against DO-178C, AS9100, SOC 2, ISO 27001, or any other standard.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Reporting a vulnerability</h2>
        <p>
          This project does not yet have a dedicated security contact or disclosure process. Until one is
          published here, report a suspected vulnerability through whatever channel you would use to reach
          the maintainers of this repository directly, rather than filing a public issue.
        </p>
      </section>
    </DocsPage>
  );
}
