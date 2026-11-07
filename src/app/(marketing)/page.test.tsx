import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LandingPage from "./page";

/**
 * The landing page's one job, tested directly: does it say what this
 * product is, in words that name the thing ("Product Development Life
 * Cycle") rather than leaving a visitor to guess from a brand name alone.
 *
 * The negative assertions here are the more load-bearing half. Earlier
 * versions of this page claimed an in-memory sub-5ms graph engine, a
 * fictional "Question" data primitive, dual-custody cryptographic sign-offs,
 * eight store integrations that did not exist, and a live telemetry strip
 * that was static markup. `no-fabricated-metrics.test.ts` guards the
 * general shape of that defect (percentages, compliance claims, "LIVE
 * CONNECTED"); this file guards the specific claims this exact page made.
 */
describe("LandingPage", () => {
  it("explicitly names what the product is", () => {
    render(<LandingPage />);

    expect(screen.getAllByText(/product development life cycle/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PDLC/).length).toBeGreaterThan(0);
  });

  it("links to real sign-up and docs routes, not placeholders", () => {
    render(<LandingPage />);

    const signUpLinks = screen.getAllByRole("link", { name: /start a project|create organization/i });
    expect(signUpLinks.length).toBeGreaterThan(0);
    for (const link of signUpLinks) expect(link).toHaveAttribute("href", "/sign-up");

    expect(screen.getByRole("link", { name: /read architecture docs/i })).toHaveAttribute("href", "/docs");
  });

  it("renders the real six-stage lifecycle stepper, not a static description of it", () => {
    render(<LandingPage />);

    // Rendered as clickable step buttons, not prose — the stage codes are
    // the real record types (`REQUIREMENT`, `READINESS`, ...) from
    // `PROGRESS_STAGE_DEFINITIONS`.
    expect(screen.getByRole("button", { name: /requirement/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /readiness/i })).toBeInTheDocument();
  });

  it("renders the live, editable quality-check demo", () => {
    render(<LandingPage />);

    expect(screen.getByLabelText(/type or edit a requirement statement/i)).toBeInTheDocument();
  });

  it("never claims a data primitive this product's schema does not have", () => {
    render(<LandingPage />);
    const text = document.body.textContent ?? "";

    // "Question" and a formal "Approval Gate" primitive were both invented;
    // the real domain has no Question model and Approval is unreferenced.
    expect(text).not.toMatch(/\bQUESTION\b.*PRIMITIVE|PRIMITIVE.*\bQUESTION\b/i);
    expect(text).not.toMatch(/APPROVAL GATE/i);
    expect(text).not.toMatch(/CHANGE DELTA/i);
  });

  it("never claims an in-memory engine, sub-millisecond latency, or dual-custody sign-offs", () => {
    render(<LandingPage />);
    const text = document.body.textContent ?? "";

    expect(text).not.toMatch(/in-memory/i);
    expect(text).not.toMatch(/sub-5ms|< ?5\s*ms/i);
    expect(text).not.toMatch(/dual-custody/i);
    expect(text).not.toMatch(/cryptographic/i);
  });

  it("never claims a store integration, since none exists", () => {
    render(<LandingPage />);
    const text = document.body.textContent ?? "";

    for (const vendor of ["Amazon", "DigiKey", "Mouser", "McMaster", "DOORS", "Jira", "Teamcenter", "Ansys"]) {
      expect(text).not.toContain(vendor);
    }
  });

  it("never shows a status readout it has not actually checked", () => {
    render(<LandingPage />);
    const text = document.body.textContent ?? "";

    expect(text).not.toMatch(/SYSTEM.{0,3}NOMINAL|GRAPH_SYNCHRONIZED|ENGINE ONLINE/i);
  });
});
