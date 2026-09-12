import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Evidence UI driven through the real API client with a faked `fetch`, so
 * request shapes, error handling and server-driven state are genuinely
 * exercised. No test here asserts a file upload, because the interface never
 * offers one — evidence here is a record and a reference, never a file.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const { EvidenceView } = await import("./evidence-view");
const { EvidenceDetailView } = await import("./evidence-detail-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const EVIDENCE_ID = "ev1aaaaaaaaaaaaaaaaaaaaa";
const OTHER_EVIDENCE_ID = "ev2aaaaaaaaaaaaaaaaaaaaa";

const PROJECT = {
  id: PROJECT_ID,
  organizationId: "org1",
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function evidence(overrides: Record<string, unknown> = {}) {
  return {
    id: EVIDENCE_ID,
    projectId: PROJECT_ID,
    identifier: "EV-001",
    title: "Hot fire test report",
    description: "Full-duration hot fire, second attempt.",
    evidenceType: "TEST_RESULT",
    sourceReference: "TR-2026-014",
    status: "DRAFT",
    recordedById: "user1aaaaaaaaaaaaaaaaaaa",
    validatedById: null,
    validatedAt: null,
    supersededById: null,
    supersededAt: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...evidence(),
    recordedBy: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada Lovelace", email: "ada@example.test" },
    validatedBy: null,
    supersededByRef: null,
    links: [],
    citingFindings: [],
    availableTransitions: ["VALIDATED", "SUPERSEDED"],
    editable: { content: true, links: true },
    history: [],
    ...overrides,
  };
}

const LINK_TARGETS = {
  REQUIREMENT: [{ id: "req1", identifier: "REQ-001", title: "Chamber pressure" }],
  ENGINEERING_DECISION: [],
  VERIFICATION_ACTIVITY: [],
  SUPPLIED_ITEM: [],
  SUPPLIER_QUALIFICATION: [],
  COMPLIANCE_ITEM: [],
};

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function fail(status: number, code: string, message: string): Response {
  return { ok: false, status, json: async () => ({ error: { code, message } }) } as unknown as Response;
}

const fetchMock = vi.fn();

function routeGets(overrides: { evidenceList?: unknown[]; detail?: unknown } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/evidence-link-targets")) return ok({ targets: LINK_TARGETS });
    if (url.endsWith(`/evidence/${EVIDENCE_ID}`)) return ok({ evidence: overrides.detail ?? detail() });
    if (url.includes("/evidence")) return ok({ evidence: overrides.evidenceList ?? [] });
    if (url.includes("/api/projects/")) return ok({ project: PROJECT });
    return ok({});
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EvidenceView", () => {
  it("shows a genuine empty state rather than a fabricated count", async () => {
    routeGets();

    render(<EvidenceView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No evidence recorded yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders fetched evidence with type and status", async () => {
    routeGets({
      evidenceList: [
        evidence({ recordedBy: { id: "u1", name: "Ada Lovelace", email: "ada@example.test" } }),
      ],
    });

    render(<EvidenceView projectId={PROJECT_ID} />);

    const link = await screen.findByRole("link", { name: "EV-001" });
    const row = link.closest("tr")!;
    expect(within(row).getByText("Test result")).toBeInTheDocument();
    expect(within(row).getByText("Draft")).toBeInTheDocument();
  });

  it("validates the create form before calling the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<EvidenceView projectId={PROJECT_ID} />);
    await screen.findByText("No evidence recorded yet");

    await user.click(screen.getAllByRole("button", { name: /record evidence/i })[0]!);
    await user.click(await screen.findByRole("button", { name: /^record evidence$/i }));

    expect(await screen.findByText("A title is required")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("creates evidence and navigates to the created record, never sending status or organization", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<EvidenceView projectId={PROJECT_ID} />);
    await screen.findByText("No evidence recorded yet");

    await user.click(screen.getAllByRole("button", { name: /record evidence/i })[0]!);
    await user.type(await screen.findByLabelText(/identifier/i), "EV-001");
    await user.type(screen.getByLabelText(/^title/i), "Hot fire test report");
    await user.type(screen.getByLabelText(/source reference/i), "TR-2026-014");

    fetchMock.mockImplementationOnce(async () => ok({ evidence: evidence() }));
    await user.click(screen.getByRole("button", { name: /^record evidence$/i }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/evidence/${EVIDENCE_ID}`),
    );

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(post![1].body);
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("organizationId");
    expect(payload).not.toHaveProperty("recordedById");
  });
});

describe("EvidenceDetailView", () => {
  it("shows who recorded it and that it is not yet validated", async () => {
    routeGets();

    render(<EvidenceDetailView projectId={PROJECT_ID} evidenceId={EVIDENCE_ID} />);

    await screen.findByRole("heading", { name: /EV-001/ });
    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText("Not yet validated")).toBeInTheDocument();
  });

  it("offers Validate while DRAFT, and validates through the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<EvidenceDetailView projectId={PROJECT_ID} evidenceId={EVIDENCE_ID} />);
    await screen.findByRole("heading", { name: /EV-001/ });

    fetchMock.mockImplementationOnce(async () => ok({ evidence: evidence({ status: "VALIDATED" }) }));
    await user.click(screen.getByRole("button", { name: "Validate" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/validate"));
      expect(call).toBeDefined();
    });
  });

  it("freezes editing once VALIDATED", async () => {
    routeGets({ detail: detail({ status: "VALIDATED", editable: { content: false, links: true } }) });

    render(<EvidenceDetailView projectId={PROJECT_ID} evidenceId={EVIDENCE_ID} />);
    await screen.findByRole("heading", { name: /EV-001/ });

    expect(screen.getByRole("button", { name: /edit/i })).toBeDisabled();
    expect(
      screen.getByText(/validated and its content is frozen/i),
    ).toBeInTheDocument();
  });

  it("supersedes evidence by picking a real, existing replacement", async () => {
    routeGets({
      detail: detail({ status: "VALIDATED", availableTransitions: ["SUPERSEDED"] }),
      evidenceList: [
        evidence(),
        evidence({ id: OTHER_EVIDENCE_ID, identifier: "EV-002", title: "Corrected hot fire report" }),
      ],
    });
    const user = userEvent.setup();

    render(<EvidenceDetailView projectId={PROJECT_ID} evidenceId={EVIDENCE_ID} />);
    await screen.findByRole("heading", { name: /EV-001/ });

    await user.click(screen.getByRole("button", { name: "Supersede…" }));
    await user.selectOptions(await screen.findByLabelText(/replacement evidence/i), OTHER_EVIDENCE_ID);

    fetchMock.mockImplementationOnce(async () =>
      ok({ evidence: evidence({ status: "SUPERSEDED", supersededById: OTHER_EVIDENCE_ID }) }),
    );
    await user.click(screen.getByRole("button", { name: "Supersede" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/supersede"));
      expect(call).toBeDefined();
      expect(JSON.parse(call![1].body).newEvidenceId).toBe(OTHER_EVIDENCE_ID);
    });
  });

  it("shows superseded evidence as read-only, with a link to its successor", async () => {
    routeGets({
      detail: detail({
        status: "SUPERSEDED",
        availableTransitions: [],
        editable: { content: false, links: false },
        supersededByRef: { id: OTHER_EVIDENCE_ID, identifier: "EV-002", title: "Corrected hot fire report" },
      }),
    });

    render(<EvidenceDetailView projectId={PROJECT_ID} evidenceId={EVIDENCE_ID} />);
    await screen.findByRole("heading", { name: /EV-001/ });

    expect(screen.getByRole("link", { name: /EV-002/ })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/evidence/${OTHER_EVIDENCE_ID}`,
    );
    expect(screen.getByText("No further transitions are possible.")).toBeInTheDocument();
  });

  it("links this evidence to a real requirement and shows it in the traceability panel", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<EvidenceDetailView projectId={PROJECT_ID} evidenceId={EVIDENCE_ID} />);
    await screen.findByRole("heading", { name: /EV-001/ });

    await user.selectOptions(screen.getByLabelText("Artifact"), "req1");

    fetchMock.mockImplementationOnce(async () =>
      ok({
        link: {
          id: "REQUIREMENT:row1",
          relation: "REQUIREMENT",
          targetId: "req1",
          identifier: "REQ-001",
          title: "Chamber pressure",
          note: null,
          createdAt: "2026-01-05T00:00:00.000Z",
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: /add link/i }));

    expect(await screen.findByText(/REQ-001/)).toBeInTheDocument();
  });

  it("shows certification findings that cite this evidence as read-only", async () => {
    routeGets({
      detail: detail({
        citingFindings: [{ id: "f1", identifier: "FND-001", title: "Structural margin", complianceItemId: "ci1" }],
      }),
    });

    render(<EvidenceDetailView projectId={PROJECT_ID} evidenceId={EVIDENCE_ID} />);
    await screen.findByRole("heading", { name: /EV-001/ });

    expect(screen.getByText(/FND-001/)).toBeInTheDocument();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
  });

  it("shows a genuine 404 back-link on load failure", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.endsWith(`/evidence/${EVIDENCE_ID}`)) {
        return fail(404, "NOT_FOUND", "Evidence not found.");
      }
      return ok({ project: PROJECT });
    });

    render(<EvidenceDetailView projectId={PROJECT_ID} evidenceId={EVIDENCE_ID} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to evidence/i })).toBeInTheDocument();
  });
});
