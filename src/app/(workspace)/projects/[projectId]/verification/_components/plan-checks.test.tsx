import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MissingChecksBanner, PlanChecksDialog } from "./plan-checks";

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const PLAN_URL = `/api/projects/${PROJECT_ID}/verification-activities/plan`;

const CANDIDATES = [
  { id: "req1", identifier: "REQ-001", title: "Pump flow", status: "DRAFT" },
  { id: "req2", identifier: "REQ-002", title: "Tank volume", status: "APPROVED" },
];

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function planned(requirementIdentifier: string, identifier: string) {
  return {
    requirementId: `id-${requirementIdentifier}`,
    requirementIdentifier,
    activity: { id: `act-${identifier}`, identifier, title: `Check ${requirementIdentifier}` },
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("MissingChecksBanner", () => {
  it("says how many requirements have no check and plans one for each, with the chosen method", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? ok({ checks: [planned("REQ-001", "VER-001"), planned("REQ-002", "VER-002")] })
        : ok({ requirements: CANDIDATES }),
    );
    const onPlanned = vi.fn();
    const user = userEvent.setup();

    render(<MissingChecksBanner projectId={PROJECT_ID} refreshKey={0} onPlanned={onPlanned} />);

    expect(await screen.findByText(/2 requirements have no check yet/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Plan 2 checks" }));

    const covered = await screen.findByRole("region", { name: "Requirements covered" });
    expect(covered).toHaveTextContent("REQ-001");
    expect(covered).toHaveTextContent("Tank volume");

    await user.click(screen.getByRole("radio", { name: /Inspect it/ }));
    await user.click(screen.getAllByRole("button", { name: "Plan 2 checks" }).at(-1)!);

    await waitFor(() => expect(onPlanned).toHaveBeenCalledTimes(1));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toBe(PLAN_URL);
    // No requirement ids: "every requirement that has no check", decided on the server.
    expect(JSON.parse(String(post[1].body))).toEqual({ method: "INSPECTION" });
  });

  it("shows nothing once every requirement has a check", async () => {
    fetchMock.mockImplementation(async () => ok({ requirements: [] }));

    const { container } = render(<MissingChecksBanner projectId={PROJECT_ID} refreshKey={0} onPlanned={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("stays out of the way when the lookup fails", async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error("offline");
    });

    const { container } = render(<MissingChecksBanner projectId={PROJECT_ID} refreshKey={0} onPlanned={vi.fn()} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe("PlanChecksDialog for one requirement", () => {
  it("plans for exactly that requirement and defaults to a test", async () => {
    fetchMock.mockImplementation(async () => ok({ checks: [planned("REQ-002", "VER-007")] }));
    const onPlanned = vi.fn();
    const user = userEvent.setup();

    render(
      <PlanChecksDialog
        projectId={PROJECT_ID}
        requirements={[CANDIDATES[1]!] as never}
        planAllWithoutChecks={false}
        open
        onOpenChange={vi.fn()}
        onPlanned={onPlanned}
      />,
    );

    expect(screen.getByRole("radio", { name: /Test it/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Plan the check" }));

    await waitFor(() => expect(onPlanned).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(String(init.body))).toEqual({ method: "TEST", requirementIds: ["req2"] });
  });

  it("shows the server's refusal and keeps the dialog open", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 409,
      json: async () => ({ error: { code: "CONFLICT", message: "REQ-002 is obsolete and needs no check." } }),
    }));
    const onPlanned = vi.fn();
    const user = userEvent.setup();

    render(
      <PlanChecksDialog
        projectId={PROJECT_ID}
        requirements={[CANDIDATES[1]!] as never}
        planAllWithoutChecks={false}
        open
        onOpenChange={vi.fn()}
        onPlanned={onPlanned}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Plan the check" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("obsolete");
    expect(onPlanned).not.toHaveBeenCalled();
  });
});
