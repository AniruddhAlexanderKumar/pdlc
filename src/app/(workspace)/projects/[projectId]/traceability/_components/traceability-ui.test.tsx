import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Traceability workspace driven through the real API client with a faked
 * `fetch` — request shapes and navigation state are genuinely exercised. No
 * test here asserts a graph model of its own: everything rendered comes
 * straight from the mocked `/graph/...` and `/traceability/objects`
 * responses, exactly as the real API returns them.
 */

const { TraceabilityView } = await import("./traceability-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

const PROJECT = {
  id: PROJECT_ID,
  organizationId: "org1",
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function node(type: string, id: string, identifier: string, label: string) {
  return { type, id, projectId: PROJECT_ID, identifier, label };
}

const REQUIREMENT = node("REQUIREMENT", "req1", "REQ-001", "Chamber pressure");
const DESIGN_ITEM = node("DESIGN_ITEM", "design1", "DI-001", "Combustion chamber");
const RISK = node("RISK", "risk1", "RSK-001", "Coolant loss");

const REQ_TO_DESIGN_EDGE = {
  type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
  source: REQUIREMENT,
  target: DESIGN_ITEM,
  relationshipId: "link1",
  createdAt: "2026-01-05T00:00:00.000Z",
  createdById: "user1",
  note: null,
  linkType: "ALLOCATED_TO",
};

const RISK_TO_REQ_EDGE = {
  type: "RISK_AFFECTS_REQUIREMENT",
  source: RISK,
  target: REQUIREMENT,
  relationshipId: "link2",
  createdAt: "2026-01-06T00:00:00.000Z",
  createdById: "user1",
  note: "Loss of coolant threatens the pressure margin.",
  linkType: null,
};

const REQUIREMENT_NEIGHBORHOOD = {
  node: REQUIREMENT,
  connections: [
    { edge: REQ_TO_DESIGN_EDGE, neighbor: DESIGN_ITEM, direction: "OUTBOUND" },
    { edge: RISK_TO_REQ_EDGE, neighbor: RISK, direction: "INBOUND" },
  ],
};

const DESIGN_ITEM_NEIGHBORHOOD = {
  node: DESIGN_ITEM,
  connections: [{ edge: REQ_TO_DESIGN_EDGE, neighbor: REQUIREMENT, direction: "INBOUND" }],
};

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const fetchMock = vi.fn();

function routeGets(neighborhoods: Record<string, unknown> = {}) {
  fetchMock.mockImplementation(async (input: string) => {
    const url = new URL(String(input), "http://localhost");
    const path = url.pathname;

    if (path === `/api/projects/${PROJECT_ID}`) return ok({ project: PROJECT });

    if (path === `/api/projects/${PROJECT_ID}/traceability/objects`) {
      const type = url.searchParams.get("type");
      if (type === "REQUIREMENT") {
        return ok({ objects: [{ id: REQUIREMENT.id, identifier: REQUIREMENT.identifier, label: REQUIREMENT.label }] });
      }
      return ok({ objects: [] });
    }

    const neighborsMatch = path.match(
      /^\/api\/projects\/[^/]+\/graph\/node\/([^/]+)\/([^/]+)\/neighbors$/,
    );
    if (neighborsMatch) {
      const [, matchedType, matchedId] = neighborsMatch;
      const key = `${matchedType}:${matchedId}`;
      const result = neighborhoods[key];
      if (result) return ok(result);
      return ok({ node: node(matchedType!, matchedId!, "", ""), connections: [] });
    }

    return ok({});
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openRequirement(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText("Object type"), "REQUIREMENT");
  await user.selectOptions(await screen.findByLabelText("Object"), REQUIREMENT.id);
  await user.click(screen.getByRole("button", { name: "Open" }));
}

describe("TraceabilityView", () => {
  it("shows a real alert when the project itself cannot be loaded, e.g. a cross-organization link", async () => {
    fetchMock.mockImplementation(async (input: string) => {
      const path = new URL(String(input), "http://localhost").pathname;
      if (path === `/api/projects/${PROJECT_ID}`) {
        return {
          ok: false,
          status: 404,
          json: async () => ({ error: { code: "NOT_FOUND", message: "Project not found." } }),
        } as unknown as Response;
      }
      return ok({});
    });

    render(<TraceabilityView projectId={PROJECT_ID} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByLabelText("Object type")).not.toBeInTheDocument();
  });

  it("shows an honest empty state before anything is opened", async () => {
    routeGets();
    render(<TraceabilityView projectId={PROJECT_ID} />);

    expect(await screen.findByText("Nothing open yet")).toBeInTheDocument();
  });

  it("opens an object and distinguishes inbound from outbound relationships", async () => {
    routeGets({ "REQUIREMENT:req1": REQUIREMENT_NEIGHBORHOOD });
    const user = userEvent.setup();
    render(<TraceabilityView projectId={PROJECT_ID} />);

    await openRequirement(user);

    expect(await screen.findByText("Currently inspecting")).toBeInTheDocument();
    const outboundSection = screen.getByText("Outbound — what this affects").closest("section")!;
    expect(within(outboundSection).getByText("DI-001", { exact: false })).toBeInTheDocument();

    const inboundSection = screen.getByText("Inbound — what affects this").closest("section")!;
    expect(within(inboundSection).getByText("RSK-001", { exact: false })).toBeInTheDocument();
    expect(
      within(inboundSection).getByText("Loss of coolant threatens the pressure margin.", {
        exact: false,
      }),
    ).toBeInTheDocument();
  });

  it("navigates into a connected object, then back again", async () => {
    routeGets({
      "REQUIREMENT:req1": REQUIREMENT_NEIGHBORHOOD,
      "DESIGN_ITEM:design1": DESIGN_ITEM_NEIGHBORHOOD,
    });
    const user = userEvent.setup();
    render(<TraceabilityView projectId={PROJECT_ID} />);

    await openRequirement(user);
    await screen.findByText("Currently inspecting");

    await user.click(screen.getByRole("button", { name: /DI-001/ }));

    await waitFor(() => {
      expect(screen.getAllByText("DI-001", { exact: false }).length).toBeGreaterThan(0);
    });
    // The breadcrumb now shows the requirement as a step behind the current object.
    expect(screen.getByRole("button", { name: "REQ-001" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => {
      expect(screen.getAllByText("REQ-001", { exact: false }).length).toBeGreaterThan(0);
    });
  });

  it("refetches with the chosen direction", async () => {
    routeGets({ "REQUIREMENT:req1": REQUIREMENT_NEIGHBORHOOD });
    const user = userEvent.setup();
    render(<TraceabilityView projectId={PROJECT_ID} />);

    await openRequirement(user);
    await screen.findByText("Currently inspecting");

    await user.click(screen.getByRole("button", { name: "Outbound" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("direction=OUTBOUND")),
      ).toBe(true);
    });
  });

  it("shows a genuine 'no relationships' state", async () => {
    routeGets({ "REQUIREMENT:req1": { node: REQUIREMENT, connections: [] } });
    const user = userEvent.setup();
    render(<TraceabilityView projectId={PROJECT_ID} />);

    await openRequirement(user);

    expect(await screen.findByText("No relationships")).toBeInTheDocument();
  });
});
