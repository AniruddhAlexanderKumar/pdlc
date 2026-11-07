import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Engineering History workspace's UI, driven through the real API
 * client with a faked `fetch`. No test here asserts a percentage, a score,
 * or generated prose, because the page never renders one.
 */

const { HistoryView } = await import("./history-view");
const { ObjectHistoryView } = await import("./object-history-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

function event(overrides: Record<string, unknown> = {}) {
  return {
    key: "RISK:RISK:rk1:risk.created:2026-01-01T00:00:00.000Z:aud1",
    timestamp: "2026-01-01T00:00:00.000Z",
    category: "CONTENT_CHANGE",
    sourceModule: "RISK",
    sourceType: "RISK",
    sourceId: "rk1",
    sourceIdentifier: "RSK-001",
    sourceLabel: "Coolant supply interruption",
    action: "risk.created",
    label: "Created",
    actorId: "user1",
    actorName: "Ada",
    detail: null,
    href: `/projects/${PROJECT_ID}/risks/rk1`,
    ...overrides,
  };
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HistoryView", () => {
  it("shows an honest empty state when nothing has been recorded", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/api/projects/")) {
        if (url.includes("/history")) return ok({ history: { events: [], page: { offset: 0, limit: 50, total: 0, hasMore: false } } });
        return ok({ project: { id: PROJECT_ID, name: "Upper Stage Propulsion" } });
      }
      return ok({});
    });

    render(<HistoryView projectId={PROJECT_ID} />);

    expect(await screen.findByText("Nothing recorded yet")).toBeInTheDocument();
  });

  it("renders a real event with its real label, reason and a working navigation link", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/history")) {
        return ok({ history: { events: [event()], page: { offset: 0, limit: 50, total: 1, hasMore: false } } });
      }
      return ok({ project: { id: PROJECT_ID, name: "Upper Stage Propulsion" } });
    });

    render(<HistoryView projectId={PROJECT_ID} />);

    expect(await screen.findByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Coolant supply interruption", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", `/projects/${PROJECT_ID}/risks/rk1`);
  });

  it("filters the timeline by module", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/history")) {
        const isRiskOnly = url.includes("module=RISK");
        return ok({
          history: {
            events: isRiskOnly ? [event()] : [event(), event({ key: "e2", sourceModule: "ISSUE", sourceType: "ISSUE", label: "Created", sourceLabel: "Sensor fault" })],
            page: { offset: 0, limit: 50, total: isRiskOnly ? 1 : 2, hasMore: false },
          },
        });
      }
      return ok({ project: { id: PROJECT_ID, name: "Upper Stage Propulsion" } });
    });
    const user = userEvent.setup();

    render(<HistoryView projectId={PROJECT_ID} />);
    await screen.findByText("Coolant supply interruption", { exact: false });
    expect(screen.getByText("Sensor fault", { exact: false })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Module"), "RISK");

    await waitFor(() => {
      expect(screen.queryByText("Sensor fault", { exact: false })).not.toBeInTheDocument();
    });
    expect(screen.getByText("Coolant supply interruption", { exact: false })).toBeInTheDocument();
  });

  it("never renders a score, probability, heatmap or percentage anywhere", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/history")) {
        return ok({ history: { events: [event()], page: { offset: 0, limit: 50, total: 1, hasMore: false } } });
      }
      return ok({ project: { id: PROJECT_ID, name: "Upper Stage Propulsion" } });
    });

    render(<HistoryView projectId={PROJECT_ID} />);
    await screen.findByText("Coolant supply interruption", { exact: false });

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d+%/);
    expect(text.toLowerCase()).not.toMatch(/risk score|heatmap|health score|probability/);
  });

  it("shows a real error state with a retry, on load failure", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/history")) {
        return { ok: false, status: 500, json: async () => ({ error: { code: "INTERNAL_ERROR", message: "boom" } }) } as unknown as Response;
      }
      return ok({ project: { id: PROJECT_ID, name: "Upper Stage Propulsion" } });
    });

    render(<HistoryView projectId={PROJECT_ID} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("ObjectHistoryView", () => {
  it("shows the object's real identity and a link back to its source page", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/history/RISK/rk1")) {
        return ok({
          history: {
            object: { type: "RISK", id: "rk1", identifier: "RSK-001", label: "Coolant supply interruption", href: `/projects/${PROJECT_ID}/risks/rk1` },
            events: [event()],
            page: { offset: 0, limit: 50, total: 1, hasMore: false },
          },
        });
      }
      return ok({});
    });

    render(<ObjectHistoryView projectId={PROJECT_ID} objectType="RISK" objectId="rk1" />);

    expect(await screen.findByRole("heading", { name: /RSK-001/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open source object/i })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/risks/rk1`,
    );
  });

  it("shows a real error state on load failure", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 404,
      json: async () => ({ error: { code: "NOT_FOUND", message: "Not found." } }),
    }));

    render(<ObjectHistoryView projectId={PROJECT_ID} objectType="RISK" objectId="rk1" />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
