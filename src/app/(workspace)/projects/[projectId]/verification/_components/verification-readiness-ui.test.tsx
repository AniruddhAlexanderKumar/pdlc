import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The verification-readiness workspace, driven through the real API client with
 * a faked `fetch`. Only the network is replaced, so what the panel renders is
 * exactly what the server said — nothing is derived in the browser, and no
 * count is asserted that the fixture did not carry.
 */

const { VerificationReadinessPanel } = await import("./verification-readiness-panel");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const ACTIVITY_ID = "va1aaaaaaaaaaaaaaaaaaaa";
const ASSESSMENT_ID = "vra1aaaaaaaaaaaaaaaaaa";
const OLDER_ASSESSMENT_ID = "vra0aaaaaaaaaaaaaaaaaa";
const REQUIREMENT_ID = "req1aaaaaaaaaaaaaaaaaa";

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function fail(status: number, code: string, message: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message } }),
  } as unknown as Response;
}

const NOT_EVALUATED = {
  status: "NOT_EVALUATED",
  verificationActivityId: ACTIVITY_ID,
  readinessVersion: "1",
};

const BLOCKING_FINDING = {
  id: "finding-blocking",
  assessmentId: ASSESSMENT_ID,
  ruleId: "VR-REQ-001",
  category: "REQUIREMENT_STATE",
  status: "BLOCKING",
  severity: "BLOCKER",
  subjectType: "REQUIREMENT",
  subjectId: REQUIREMENT_ID,
  subjectIdentifier: "REQ-104",
  subjectLabel: "Maximum chamber pressure",
  message:
    "Requirement REQ-104 is IN_REVIEW. A verification activity cannot be considered ready until the requirement reaches APPROVED or BASELINED.",
  basis: ["REQUIREMENT_LIFECYCLE_STATE", "REQUIREMENT_VERIFICATION_LINK"],
  sequence: 0,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const WARNING_FINDING = {
  id: "finding-warning",
  assessmentId: ASSESSMENT_ID,
  ruleId: "VR-OWN-001",
  category: "OWNER",
  status: "WARNING",
  severity: "ADVISORY",
  subjectType: "VERIFICATION_ACTIVITY",
  subjectId: ACTIVITY_ID,
  subjectIdentifier: "VA-001",
  subjectLabel: "Proof pressure test",
  message:
    "VA-001 has no owner assigned, so nobody is accountable for performing it. This does not block readiness.",
  basis: ["OWNER_NOT_REQUIRED_BY_DOMAIN", "VERIFICATION_OWNER_FIELD"],
  sequence: 1,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const UNKNOWN_FINDING = {
  id: "finding-unknown",
  assessmentId: ASSESSMENT_ID,
  ruleId: "VR-ASM-003",
  category: "ASSUMPTION_STATE",
  status: "UNKNOWN",
  severity: "INDETERMINATE",
  subjectType: "DECISION_ASSUMPTION",
  subjectId: "asm1aaaaaaaaaaaaaaaaaa",
  subjectIdentifier: null,
  subjectLabel: "Nozzle wall temperature stays below 900 K",
  message:
    'Assumption "Nozzle wall temperature stays below 900 K" stands behind a decision this verification depends on and has never been monitored.',
  basis: ["ASSUMPTION_MONITORING_NOT_EVALUATED", "DECISION_ASSUMPTION_RECORD"],
  sequence: 2,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const INFORMATIONAL_FINDING = {
  id: "finding-info",
  assessmentId: ASSESSMENT_ID,
  ruleId: "VR-LIFE-001",
  category: "VERIFICATION_DEFINITION",
  status: "INFORMATIONAL",
  severity: "NOTE",
  subjectType: "VERIFICATION_ACTIVITY",
  subjectId: ACTIVITY_ID,
  subjectIdentifier: "VA-001",
  subjectLabel: "Proof pressure test",
  message: "VA-001 is PLANNED. This assessment answers whether it can be executed.",
  basis: ["VERIFICATION_LIFECYCLE_STATE"],
  sequence: 3,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const BASIS = {
  verificationActivityId: ACTIVITY_ID,
  scope: "EXECUTION",
  objects: [
    {
      role: "VERIFICATION_ACTIVITY",
      type: "VERIFICATION_ACTIVITY",
      id: ACTIVITY_ID,
      identifier: "VA-001",
      label: "Proof pressure test",
      revision: "2026-02-01T00:00:00.000Z",
      state: "PLANNED",
    },
    {
      role: "VERIFIED_REQUIREMENT",
      type: "REQUIREMENT",
      id: REQUIREMENT_ID,
      identifier: "REQ-104",
      label: "Maximum chamber pressure",
      revision: "2026-02-01T00:00:00.000Z",
      state: "IN_REVIEW",
    },
    {
      role: "PREREQUISITE_DESIGN_ITEM",
      type: "DESIGN_ITEM",
      id: "di1aaaaaaaaaaaaaaaaaaa",
      identifier: "DI-007",
      label: "Combustion chamber",
      revision: "2026-02-01T00:00:00.000Z",
      state: "BASELINED",
    },
  ],
  relationships: [
    {
      edgeType: "REQUIREMENT_VERIFIED_BY",
      relationshipId: "rel-verify",
      fromType: "REQUIREMENT",
      fromId: REQUIREMENT_ID,
      toType: "VERIFICATION_ACTIVITY",
      toId: ACTIVITY_ID,
      linkType: null,
    },
    {
      edgeType: "REQUIREMENT_ALLOCATED_TO_DESIGN",
      relationshipId: "rel-allocate",
      fromType: "REQUIREMENT",
      fromId: REQUIREMENT_ID,
      toType: "DESIGN_ITEM",
      toId: "di1aaaaaaaaaaaaaaaaaaa",
      linkType: "ALLOCATED_TO",
    },
  ],
  monitoring: [],
  changes: [
    {
      changeRequestId: "chg1aaaaaaaaaaaaaaaaaa",
      identifier: "CR-014",
      title: "Raise the burst margin",
      status: "UNDER_REVIEW",
      analysisId: "ana1",
      analysisFingerprint: "fp-a",
      analysisFreshness: "CURRENT",
      declaredSubjects: [`REQUIREMENT:${REQUIREMENT_ID}`],
      affectedSubjects: [`REQUIREMENT:${REQUIREMENT_ID}`],
    },
  ],
};

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    projectId: PROJECT_ID,
    verificationActivityId: ACTIVITY_ID,
    status: "NOT_READY",
    scope: "EXECUTION",
    readinessVersion: "1",
    fingerprint: "fingerprint-a",
    summary: { findings: 4, blocking: 1, warning: 1, informational: 1, unknown: 1 },
    evaluatedAt: "2026-03-01T00:00:00.000Z",
    evaluatedById: "user1",
    createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  // `assessment` is merged rather than replaced, so a test that overrides one
  // field of it does not silently drop the summary the panel renders.
  const { assessment: assessmentOverrides, ...rest } = overrides;

  return {
    assessment: assessment((assessmentOverrides as Record<string, unknown>) ?? {}),
    freshness: "CURRENT",
    findings: [
      BLOCKING_FINDING,
      UNKNOWN_FINDING,
      WARNING_FINDING,
      INFORMATIONAL_FINDING,
    ],
    basis: BASIS,
    ...rest,
  };
}

const fetchMock = vi.fn();

/**
 * Routes the two GETs the panel issues on mount.
 *
 * Everything else falls through to a failure, so a test that expects a request
 * the panel does not actually make will notice.
 */
function routeGets(latest: unknown, assessments: unknown[] = []) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/readiness/latest")) return ok({ latest });
    if (url.endsWith("/readiness")) return ok({ assessments });
    if (url.includes("/verification-readiness/")) return ok({ report: report() });
    return fail(404, "NOT_FOUND", "No route");
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- No assessment ----------------------------------------------------------

describe("when nothing has been evaluated", () => {
  it("says so rather than showing a zero or a hundred per cent", async () => {
    routeGets(NOT_EVALUATED);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    expect(
      await screen.findByText(/No verification-readiness assessment has been run/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Readiness finding counts")).not.toBeInTheDocument();
  });

  it("offers an explicit evaluate action", async () => {
    routeGets(NOT_EVALUATED);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    expect(
      await screen.findByRole("button", { name: /evaluate readiness/i }),
    ).toBeInTheDocument();
  });

  it("does not evaluate on its own", async () => {
    routeGets(NOT_EVALUATED);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText(/No verification-readiness assessment has been run/i);

    // Loading a page must never record an engineering judgement.
    const posts = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(0);
  });
});

// --- The three states -------------------------------------------------------

describe("the readiness verdict", () => {
  it("shows NOT READY with the question it answered", async () => {
    routeGets(report(), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    const verdict = within(await screen.findByRole("group", { name: "Readiness verdict" }));
    expect(verdict.getByText("Not ready")).toBeInTheDocument();
    // The scope is stated next to the verdict, so "ready" is never ambiguous.
    expect(verdict.getByText("Ready to execute?")).toBeInTheDocument();
  });

  it("shows READY without implying the activity has passed", async () => {
    routeGets(
      report({
        assessment: { status: "READY" },
        findings: [INFORMATIONAL_FINDING],
      }),
      [assessment({ status: "READY" })],
    );

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    expect(await screen.findAllByText("Ready")).not.toHaveLength(0);
    expect(screen.getByText(/not that it has passed/i)).toBeInTheDocument();
  });

  it("shows UNKNOWN, and says readiness is not being claimed", async () => {
    routeGets(
      report({
        assessment: { status: "UNKNOWN" },
        findings: [UNKNOWN_FINDING],
      }),
      [assessment({ status: "UNKNOWN" })],
    );

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    expect(await screen.findAllByText("Unknown")).not.toHaveLength(0);
    expect(
      screen.getByText(/not being claimed on information that is missing/i),
    ).toBeInTheDocument();
  });

  it("states the readiness-versus-result distinction on the page", async () => {
    routeGets(report(), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    const distinction = within(
      await screen.findByLabelText("Readiness compared with verification result"),
    );
    expect(distinction.getByText("Verification readiness")).toBeInTheDocument();
    expect(distinction.getByText("Verification result")).toBeInTheDocument();
    expect(distinction.getByText(/What happened when the verification was performed/i))
      .toBeInTheDocument();
  });
});

// --- Findings ---------------------------------------------------------------

describe("findings", () => {
  it("renders the rule, category, status, subject and explanation the server sent", async () => {
    routeGets(report(), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    const row = (await screen.findByText("VR-REQ-001")).closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText("Requirement state")).toBeInTheDocument();
    expect(cells.getByText("Blocking")).toBeInTheDocument();
    expect(cells.getByRole("link", { name: "REQ-104" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/requirements/${REQUIREMENT_ID}`,
    );
    // The explanation names the object and the state, never "readiness failed".
    expect(cells.getByText(/Requirement REQ-104 is IN_REVIEW/)).toBeInTheDocument();
  });

  it("distinguishes blocking, warning, unknown and informational", async () => {
    routeGets(report(), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText("VR-REQ-001");

    const table = screen.getByRole("table");
    expect(within(table).getByText("Blocking")).toBeInTheDocument();
    expect(within(table).getByText("Warning")).toBeInTheDocument();
    expect(within(table).getByText("Unknown")).toBeInTheDocument();
    expect(within(table).getByText("Information")).toBeInTheDocument();
  });

  it("shows the counts the server reported, and no other figure", async () => {
    routeGets(report(), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    const counts = await screen.findByLabelText("Readiness finding counts");
    expect(within(counts).getByText("Blocking")).toBeInTheDocument();
    // Exactly what the fixture's summary said: one of each except informational.
    expect(within(counts).getAllByText("1")).toHaveLength(4);
    expect(within(counts).queryByText(/%/)).not.toBeInTheDocument();
  });

  it("explains a finding's rule and basis on demand", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText("VR-REQ-001");

    const row = screen.getByText("VR-REQ-001").closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /why/i }));

    expect(await screen.findByText("Rule VR-REQ-001")).toBeInTheDocument();
    expect(screen.getByText(/Condition:/)).toBeInTheDocument();
    // The basis markers the server sent, in readable form.
    expect(screen.getByText("requirement lifecycle state")).toBeInTheDocument();
    expect(screen.getByText("requirement verification link")).toBeInTheDocument();
  });

  it("never renders a percentage or a score", async () => {
    routeGets(report(), [assessment()]);

    const { container } = render(
      <VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />,
    );
    await screen.findByText("VR-REQ-001");

    expect(container.textContent).not.toMatch(/\d+\s*%/);
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+\s*read/i);
  });
});

// --- Basis ------------------------------------------------------------------

describe("the engineering basis", () => {
  it("lets the reader inspect exactly which objects were considered", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText("VR-REQ-001");

    await user.click(screen.getByRole("button", { name: /inspect basis/i }));

    expect(await screen.findByText("Requirement verified")).toBeInTheDocument();
    expect(screen.getByText("Prerequisite design item")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /DI-007 — Combustion chamber/ })).toBeInTheDocument();
  });

  it("shows the real relationship rows the walk went through", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText("VR-REQ-001");
    await user.click(screen.getByRole("button", { name: /inspect basis/i }));

    expect(await screen.findByText("REQUIREMENT_VERIFIED_BY")).toBeInTheDocument();
    expect(screen.getByText("REQUIREMENT_ALLOCATED_TO_DESIGN (ALLOCATED_TO)")).toBeInTheDocument();
  });

  it("names the change impact it consumed, and how fresh that analysis was", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText("VR-REQ-001");
    await user.click(screen.getByRole("button", { name: /inspect basis/i }));

    expect(await screen.findByText("Change impact considered")).toBeInTheDocument();
    expect(screen.getByText(/impact analysis: current/i)).toBeInTheDocument();
  });
});

// --- Stale ------------------------------------------------------------------

describe("a stale assessment", () => {
  it("says it is stale and explains why", async () => {
    routeGets(report({ freshness: "STALE" }), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    expect(await screen.findByText(/Readiness assessment is stale/i)).toBeInTheDocument();
    expect(
      screen.getByText(/engineering basis changed after this assessment was created/i),
    ).toBeInTheDocument();
  });

  it("offers a re-evaluation instead of performing one", async () => {
    routeGets(report({ freshness: "STALE" }), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText(/Readiness assessment is stale/i);

    expect(screen.getByRole("button", { name: /evaluate again/i })).toBeInTheDocument();
    const posts = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(0);
  });

  it("still shows the stored verdict rather than hiding it", async () => {
    routeGets(report({ freshness: "STALE" }), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    const verdict = within(await screen.findByRole("group", { name: "Readiness verdict" }));
    expect(verdict.getByText("Not ready")).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("does not present an unknown freshness as current", async () => {
    routeGets(report({ freshness: "UNKNOWN" }), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    expect(
      await screen.findByText(/could not be determined/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/not being presented as current/i)).toBeInTheDocument();
  });
});

// --- Evaluate action --------------------------------------------------------

describe("the evaluate action", () => {
  it("posts an evaluation and re-reads the result", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText("VR-REQ-001");

    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return ok({ report: report() });
      if (url.endsWith("/readiness/latest")) return ok({ latest: report() });
      if (url.endsWith("/readiness")) return ok({ assessments: [assessment()] });
      return fail(404, "NOT_FOUND", "No route");
    });

    await user.click(screen.getByRole("button", { name: /evaluate readiness/i }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        (call) => (call[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(posts[0]?.[0]).toBe(
        `/api/projects/${PROJECT_ID}/verification-activities/${ACTIVITY_ID}/readiness`,
      );
      // Nothing about the verdict is sent from the browser.
      expect(posts[0]?.[1]?.body).toBe("{}");
    });

    // And the panel re-reads rather than trusting its own POST response.
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/readiness/latest")),
      ).toBe(true);
    });
  });

  it("reports a server error without fabricating a verdict", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText("VR-REQ-001");

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return fail(422, "VERIFICATION_READINESS_FAILED", "The evaluation could not complete.");
      }
      if (url.endsWith("/readiness/latest")) return ok({ latest: report() });
      if (url.endsWith("/readiness")) return ok({ assessments: [assessment()] });
      return fail(404, "NOT_FOUND", "No route");
    });

    await user.click(screen.getByRole("button", { name: /evaluate readiness/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // The previous assessment is still shown, unchanged — a failed evaluation
    // must not leave the reader with a verdict nobody produced.
    const verdict = within(screen.getByRole("group", { name: "Readiness verdict" }));
    expect(verdict.getByText("Not ready")).toBeInTheDocument();
  });

  it("surfaces a failed initial load with a retry", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith("/readiness/latest")) {
        return fail(500, "INTERNAL_ERROR", "Something went wrong");
      }
      return ok({ assessments: [] });
    });

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

// --- History ----------------------------------------------------------------

describe("history", () => {
  it("lists prior assessments with their date, status and version", async () => {
    routeGets(report(), [
      assessment(),
      assessment({
        id: OLDER_ASSESSMENT_ID,
        status: "READY",
        evaluatedAt: "2026-02-01T00:00:00.000Z",
      }),
    ]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);

    expect(await screen.findByText("History")).toBeInTheDocument();
    expect(screen.getAllByText("v1").length).toBeGreaterThan(0);
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(
      screen.getByText(/Assessments are immutable/i),
    ).toBeInTheDocument();
  });

  it("opens a historical assessment read-only", async () => {
    routeGets(report(), [
      assessment(),
      assessment({
        id: OLDER_ASSESSMENT_ID,
        status: "READY",
        evaluatedAt: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    const user = userEvent.setup();

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText("History");

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes(`/verification-readiness/${OLDER_ASSESSMENT_ID}`)) {
        return ok({
          report: report({
            assessment: { id: OLDER_ASSESSMENT_ID, status: "READY" },
            freshness: "STALE",
          }),
        });
      }
      return fail(404, "NOT_FOUND", "No route");
    });

    const rows = screen.getAllByRole("button", { name: /^Open/ });
    await user.click(rows[rows.length - 1] as HTMLElement);

    expect(await screen.findByText(/Viewing a historical assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be edited/i)).toBeInTheDocument();
  });

  it("offers no way to edit an old assessment", async () => {
    routeGets(report(), [assessment()]);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText("History");

    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("shows no history section before anything has been evaluated", async () => {
    routeGets(NOT_EVALUATED, []);

    render(<VerificationReadinessPanel projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByText(/No verification-readiness assessment has been run/i);

    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });
});
