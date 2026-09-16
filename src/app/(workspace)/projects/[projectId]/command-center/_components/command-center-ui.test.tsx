import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Command Center UI driven through the real API client with a faked
 * `fetch`. No test here asserts a percentage, a score, or a decorative
 * chart, because the page never renders one.
 */

const { CommandCenterView } = await import("./command-center-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

function baseView(overrides: Record<string, unknown> = {}) {
  return {
    project: {
      id: PROJECT_ID,
      identifier: null,
      name: "Upper Stage Propulsion",
      description: "A test project.",
      status: "ACTIVE",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    attentionItems: [],
    readiness: {
      technical: [
        {
          gate: "SYSTEM_DEFINITION",
          status: "NOT_EVALUATED",
          freshness: null,
          evaluatedAt: null,
          blocking: 0,
          unknown: 0,
          href: `/projects/${PROJECT_ID}`,
        },
      ],
      verification: { activitiesTotal: 0, activitiesFailed: 0, activitiesNeverEvaluated: 0, attentionActivities: [] },
      certification: {
        hasProgram: false,
        programIdentifier: null,
        activeBasisIdentifier: null,
        review: null,
        openFindings: [],
      },
      changeImpact: { activeChanges: [] },
      assumptions: { total: 0, reviewRequired: 0, basisChanged: 0, neverEvaluated: 0, attentionAssumptions: [] },
      drift: {
        status: "NOT_EVALUATED",
        evaluatedAt: null,
        findings: 0,
        reviewRequired: 0,
        unknown: 0,
        href: `/projects/${PROJECT_ID}/drift`,
      },
    },
    configuration: {
      hasActiveBaseline: false,
      baselineId: null,
      baselineIdentifier: null,
      baselineName: null,
      status: null,
      memberCount: null,
      changedCount: null,
      missingCount: null,
      comparisonStatus: null,
      href: `/projects/${PROJECT_ID}/baselines`,
    },
    risks: { open: 0, items: [] },
    issues: { open: 0, attentionCount: 0, items: [] },
    suppliers: { suppliersUnderReview: [], suppliedItemsUnderReview: [], qualificationsAttention: [] },
    evidence: { draftCount: 0, validatedCount: 0, supersededCount: 0, draftItems: [] },
    sentinel: { openCount: 0, acknowledgedCount: 0, targets: [] },
    traceabilityHref: `/projects/${PROJECT_ID}/traceability`,
    historyHref: `/projects/${PROJECT_ID}/history`,
    ...overrides,
  };
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const fetchMock = vi.fn();

function routeGets(commandCenter: unknown) {
  fetchMock.mockImplementation(async () => ok({ commandCenter }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("CommandCenterView", () => {
  it("shows a genuine empty attention state", async () => {
    routeGets(baseView());

    render(<CommandCenterView projectId={PROJECT_ID} />);

    expect(await screen.findByText("Nothing requires attention right now")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upper Stage Propulsion" })).toBeInTheDocument();
  });

  it("offers real entry points into Engineering History and Traceability", async () => {
    routeGets(baseView());

    render(<CommandCenterView projectId={PROJECT_ID} />);

    await screen.findByRole("heading", { name: "Upper Stage Propulsion" });
    expect(screen.getByRole("link", { name: /engineering history/i })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/history`,
    );
    expect(screen.getByRole("link", { name: /open traceability/i })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/traceability`,
    );
  });

  it("renders an attention item with its real reason and a working navigation link", async () => {
    routeGets(
      baseView({
        attentionItems: [
          {
            key: "RISK:RISK:rk1",
            sourceModule: "RISK",
            sourceType: "RISK",
            sourceId: "rk1",
            identifier: "RSK-001",
            title: "Coolant supply interruption",
            state: "OPEN",
            reason: "Risk RSK-001 is OPEN",
            href: `/projects/${PROJECT_ID}/risks/rk1`,
          },
        ],
      }),
    );

    render(<CommandCenterView projectId={PROJECT_ID} />);

    expect(await screen.findByText("Risk RSK-001 is OPEN")).toBeInTheDocument();
    const openLinks = screen.getAllByRole("link", { name: "Open" });
    expect(openLinks.some((link) => link.getAttribute("href") === `/projects/${PROJECT_ID}/risks/rk1`)).toBe(
      true,
    );
  });

  it("filters the attention list by source module", async () => {
    routeGets(
      baseView({
        attentionItems: [
          {
            key: "RISK:RISK:rk1",
            sourceModule: "RISK",
            sourceType: "RISK",
            sourceId: "rk1",
            identifier: "RSK-001",
            title: "Coolant supply interruption",
            state: "OPEN",
            reason: "Risk RSK-001 is OPEN",
            href: `/projects/${PROJECT_ID}/risks/rk1`,
          },
          {
            key: "ISSUE:ISSUE:is1",
            sourceModule: "ISSUE",
            sourceType: "ISSUE",
            sourceId: "is1",
            identifier: "ISS-001",
            title: "Sensor fault",
            state: "CRITICAL",
            reason: "Issue ISS-001 is CRITICAL and OPEN",
            href: `/projects/${PROJECT_ID}/issues/is1`,
          },
        ],
      }),
    );
    const user = userEvent.setup();

    render(<CommandCenterView projectId={PROJECT_ID} />);
    await screen.findByText("Risk RSK-001 is OPEN");
    expect(screen.getByText("Issue ISS-001 is CRITICAL and OPEN")).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Source"), "RISK");

    await waitFor(() => {
      expect(screen.queryByText("Issue ISS-001 is CRITICAL and OPEN")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Risk RSK-001 is OPEN")).toBeInTheDocument();
  });

  it("shows the active baseline's real member and changed counts, with a working link", async () => {
    routeGets(
      baseView({
        configuration: {
          hasActiveBaseline: true,
          baselineId: "bl1",
          baselineIdentifier: "BL-001",
          baselineName: "Preliminary design baseline",
          status: "ACTIVE",
          memberCount: 3,
          changedCount: 1,
          missingCount: 0,
          comparisonStatus: "CURRENT",
          href: `/projects/${PROJECT_ID}/baselines/bl1`,
        },
      }),
    );

    render(<CommandCenterView projectId={PROJECT_ID} />);

    expect(await screen.findByText("Baseline BL-001")).toBeInTheDocument();
    expect(screen.getByText(/3 member\(s\) · 1 changed · 0 no longer resolvable/)).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Open" });
    expect(links.some((link) => link.getAttribute("href") === `/projects/${PROJECT_ID}/baselines/bl1`)).toBe(
      true,
    );
  });

  it("shows an honest empty state when the project has no active baseline", async () => {
    routeGets(baseView());

    render(<CommandCenterView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No active baseline exists yet for this project.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open baseline workspace" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/baselines`,
    );
  });

  it("never renders a score, probability, heatmap or percentage anywhere on the page", async () => {
    routeGets(
      baseView({
        risks: { open: 1, items: [{ id: "rk1", identifier: "RSK-001", title: "x", status: "OPEN", href: "#" }] },
      }),
    );

    render(<CommandCenterView projectId={PROJECT_ID} />);
    await screen.findByRole("heading", { name: "Upper Stage Propulsion" });

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d+%/);
    expect(text.toLowerCase()).not.toMatch(/risk score|heatmap|health score|probability/);
  });

  it("shows a real error state with a retry, on load failure", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { code: "INTERNAL_ERROR", message: "boom" } }),
    }));

    render(<CommandCenterView projectId={PROJECT_ID} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("Customize layout can remove a section, and it stays gone on a fresh mount of the same project", async () => {
    routeGets(baseView());
    const user = userEvent.setup();
    const { unmount } = render(<CommandCenterView projectId={PROJECT_ID} />);

    await screen.findByRole("heading", { name: "Suppliers" });

    await user.click(screen.getByRole("button", { name: /customize layout/i }));
    await user.click(screen.getByRole("checkbox", { name: "Suppliers" }));

    expect(screen.queryByRole("heading", { name: "Suppliers" })).not.toBeInTheDocument();

    unmount();
    render(<CommandCenterView projectId={PROJECT_ID} />);
    await screen.findByRole("heading", { name: "Upper Stage Propulsion" });
    expect(screen.queryByRole("heading", { name: "Suppliers" })).not.toBeInTheDocument();
  });

  it("re-checking a removed section brings it back", async () => {
    routeGets(baseView());
    const user = userEvent.setup();
    render(<CommandCenterView projectId={PROJECT_ID} />);

    await screen.findByRole("heading", { name: "Suppliers" });
    await user.click(screen.getByRole("button", { name: /customize layout/i }));
    await user.click(screen.getByRole("checkbox", { name: "Suppliers" }));
    expect(screen.queryByRole("heading", { name: "Suppliers" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Suppliers" }));
    expect(screen.getByRole("heading", { name: "Suppliers" })).toBeInTheDocument();
  });

  it("never offers to remove the page's own point — Attention required has no checkbox", async () => {
    routeGets(baseView());
    const user = userEvent.setup();
    render(<CommandCenterView projectId={PROJECT_ID} />);

    await screen.findByRole("heading", { name: "Upper Stage Propulsion" });
    await user.click(screen.getByRole("button", { name: /customize layout/i }));

    expect(screen.queryByRole("checkbox", { name: /attention/i })).not.toBeInTheDocument();
  });
});
