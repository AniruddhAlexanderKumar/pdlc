import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SurveillanceTargetDto } from "@/lib/api/sentinel";

/**
 * The Decision Sentinel workspace, driven through the real API client with a
 * faked `fetch`. Only the network is replaced, so what this view renders is
 * exactly what the server said — no numeric score, no risk rating, and every
 * count on screen traces back to a fetch response, never a client guess.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { SentinelView } = await import("./sentinel-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

const PROJECT = {
  id: PROJECT_ID,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function fail(status: number, code: string, message: string): Response {
  return { ok: false, status, json: async () => ({ error: { code, message } }) } as unknown as Response;
}

function target(overrides: Partial<SurveillanceTargetDto> = {}): SurveillanceTargetDto {
  return {
    id: "tgt1aaaaaaaaaaaaaaaaaaaa",
    projectId: PROJECT_ID,
    targetType: "VERIFICATION_READINESS",
    targetId: "va1aaaaaaaaaaaaaaaaaaaa",
    targetIdentifier: "VA-001",
    targetLabel: "Hot fire test",
    reason: "The requirement changed after a verification readiness assessment included it in its basis.",
    sourceEventId: "evt1aaaaaaaaaaaaaaaaaa",
    sourceType: "REQUIREMENT",
    sourceId: "req1aaaaaaaaaaaaaaaaaaaa",
    sourceIdentifier: "REQ-001",
    sourceLabel: "Chamber pressure",
    status: "OPEN",
    detectedAt: "2026-03-01T00:00:00.000Z",
    acknowledgedAt: null,
    acknowledgedById: null,
    acknowledgementNote: null,
    resolvedAt: null,
    resolvedById: null,
    resolutionNote: null,
    supersededById: null,
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

/** A small stateful fake server: reads reflect whatever the last write did. */
function makeServer(initial: { open?: ReturnType<typeof target>[]; history?: ReturnType<typeof target>[] } = {}) {
  const state = {
    open: initial.open ?? [],
    history: initial.history ?? [],
    detectSummary: { eventsCreated: 0, targetsOpened: 0, targetsUpdated: 0 },
  };

  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";

    if (method === "GET" && url === `/api/projects/${PROJECT_ID}`) {
      return ok({ project: PROJECT });
    }
    if (method === "GET" && url.endsWith("/sentinel/open")) {
      return ok({ targets: state.open });
    }
    if (method === "GET" && url.endsWith("/sentinel/history")) {
      return ok({ targets: state.history });
    }
    if (method === "POST" && url.endsWith("/sentinel/detect")) {
      return ok({ summary: state.detectSummary });
    }

    const match = /\/sentinel\/([^/]+)\/(acknowledge|resolve|reevaluate)$/.exec(url);
    if (method === "POST" && match) {
      const [, id, action] = match;
      const current = state.open.find((t) => t.id === id) ?? state.history.find((t) => t.id === id);
      if (!current) return fail(404, "NOT_FOUND", "Surveillance target was not found.");
      const body = init?.body ? (JSON.parse(init.body as string) as { note?: string }) : {};

      let updated: ReturnType<typeof target>;
      if (action === "acknowledge") {
        updated = { ...current, status: "ACKNOWLEDGED", acknowledgementNote: body.note ?? null };
      } else if (action === "resolve") {
        updated = { ...current, status: "RESOLVED", resolutionNote: body.note ?? "" };
      } else {
        updated = {
          ...current,
          status: "RESOLVED",
          resolutionNote: "Resolved automatically: a new evaluation was run and reflects the current engineering state.",
        };
      }

      state.open = state.open.filter((t) => t.id !== id);
      state.history = state.history.filter((t) => t.id !== id);
      if (updated.status === "OPEN" || updated.status === "ACKNOWLEDGED") state.open.push(updated);
      else state.history.unshift(updated);

      return ok({ target: updated });
    }

    throw new Error(`Unhandled request in test: ${method} ${url}`);
  });

  return { mock, state };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("empty state", () => {
  it("says plainly that nothing is open, rather than showing a fabricated all-clear score", async () => {
    const { mock } = makeServer({ open: [] });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No open surveillance")).toBeInTheDocument();
    expect(screen.getByText(/nothing currently needs reevaluation/i)).toBeInTheDocument();
  });
});

describe("open signals", () => {
  it("renders an open target with its type, status, source and reason", async () => {
    const { mock } = makeServer({ open: [target()] });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);

    expect(await screen.findByText("Verification Readiness")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText(/REQ-001 — Chamber pressure/)).toBeInTheDocument();
    expect(
      screen.getByText(/The requirement changed after a verification readiness assessment/),
    ).toBeInTheDocument();
  });

  it("offers Acknowledge, Re-evaluate and Resolve on an OPEN target", async () => {
    const { mock } = makeServer({ open: [target({ status: "OPEN" })] });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-evaluate" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
  });

  it("**never offers Acknowledge again on an already-acknowledged target**", async () => {
    const { mock } = makeServer({
      open: [target({ status: "ACKNOWLEDGED", acknowledgementNote: "seen it" })],
    });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-evaluate" })).toBeInTheDocument();
    expect(screen.getByText(/Acknowledged: seen it/)).toBeInTheDocument();
  });

  it("links to the source object when its detail page exists", async () => {
    const { mock } = makeServer({ open: [target({ sourceType: "REQUIREMENT" })] });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    const link = screen.getByRole("link", { name: "Open source object" });
    expect(link).toHaveAttribute("href", `/projects/${PROJECT_ID}/requirements/req1aaaaaaaaaaaaaaaaaaaa`);
  });

  it("**omits the source link for a source type with no detail page**", async () => {
    const { mock } = makeServer({
      open: [target({ sourceType: "DECISION_ASSUMPTION", sourceId: "asm1aaaaaaaaaaaaaaaaaaa" })],
    });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    expect(screen.queryByRole("link", { name: "Open source object" })).not.toBeInTheDocument();
  });

  it("labels the affected-object link 'change' for an impact-analysis target and 'page' otherwise", async () => {
    const { mock } = makeServer({
      open: [
        target({
          id: "t-impact",
          targetType: "IMPACT_ANALYSIS",
          targetId: "cr1aaaaaaaaaaaaaaaaaaaa",
        }),
        target({ id: "t-vr", targetType: "VERIFICATION_READINESS" }),
      ],
    });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Impact Analysis");

    expect(screen.getByRole("link", { name: "Open affected change" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/changes/cr1aaaaaaaaaaaaaaaaaaaa`,
    );
    expect(screen.getByRole("link", { name: "Open affected page" })).toBeInTheDocument();
  });
});

describe("history", () => {
  it("switches to resolved history and shows the resolution note, with no action buttons", async () => {
    const { mock } = makeServer({
      open: [],
      history: [target({ status: "RESOLVED", resolutionNote: "re-ran verification readiness" })],
    });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("No open surveillance");

    await user.click(screen.getByRole("button", { name: /recently resolved/i }));

    expect(await screen.findByText(/Resolved: re-ran verification readiness/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Re-evaluate" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
  });

  it("shows an honest empty state when nothing has been resolved yet", async () => {
    const { mock } = makeServer({ open: [], history: [] });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("No open surveillance");

    await user.click(screen.getByRole("button", { name: /recently resolved/i }));

    expect(await screen.findByText("No resolved or superseded signals yet")).toBeInTheDocument();
  });

  it("explains a superseded target without action buttons", async () => {
    const { mock } = makeServer({
      open: [],
      history: [target({ status: "SUPERSEDED" })],
    });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("No open surveillance");
    await user.click(screen.getByRole("button", { name: /recently resolved/i }));

    expect(
      await screen.findByText(/Superseded by a newer surveillance signal on the same target/),
    ).toBeInTheDocument();
  });
});

describe("detection", () => {
  it("runs detection on an explicit click and shows the real summary", async () => {
    const { mock, state } = makeServer({ open: [] });
    state.detectSummary = { eventsCreated: 2, targetsOpened: 1, targetsUpdated: 0 };
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("No open surveillance");

    await user.click(screen.getByRole("button", { name: /run detection/i }));

    expect(await screen.findByText(/2 changes detected — 1 new signal opened, 0 updated\./)).toBeInTheDocument();
  });

  it("never runs detection merely by loading the page", async () => {
    const { mock } = makeServer({ open: [] });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("No open surveillance");

    expect(mock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST")).toBe(
      false,
    );
  });

  it("surfaces a detection failure without silently doing nothing", async () => {
    const { mock } = makeServer({ open: [] });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("No open surveillance");

    mock.mockImplementationOnce(async () => fail(500, "INTERNAL_ERROR", "The detection could not run."));
    await user.click(screen.getByRole("button", { name: /run detection/i }));

    // The server's own message is deliberately not surfaced for an unknown
    // failure code — describeApiError() replaces it with a generic one.
    expect(await screen.findByText(/something went wrong on the server/i)).toBeInTheDocument();
  });
});

describe("acknowledge, reevaluate and resolve", () => {
  it("acknowledges a target and reflects the change after refetching", async () => {
    const { mock } = makeServer({ open: [target({ status: "OPEN" })] });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    await user.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument());
    const postCall = mock.mock.calls.find(([url]) => String(url).endsWith("/acknowledge"));
    expect(postCall?.[0]).toBe(`/api/projects/${PROJECT_ID}/sentinel/tgt1aaaaaaaaaaaaaaaaaaaa/acknowledge`);
  });

  it("dispatches reevaluation and the target disappears from the open list once resolved", async () => {
    const { mock } = makeServer({ open: [target({ status: "OPEN" })] });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    await user.click(screen.getByRole("button", { name: "Re-evaluate" }));

    await waitFor(() => expect(screen.queryByText("Verification Readiness")).not.toBeInTheDocument());
    expect(await screen.findByText("No open surveillance")).toBeInTheDocument();
  });

  it("**requires a note before Resolve can be submitted**", async () => {
    const { mock } = makeServer({ open: [target({ status: "OPEN" })] });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: /^resolve$/i })).toBeDisabled();

    await user.type(screen.getByLabelText(/note/i), "re-ran verification readiness");
    expect(screen.getByRole("button", { name: /^resolve$/i })).toBeEnabled();
  });

  it("resolves a target with its note and closes the dialog", async () => {
    const { mock } = makeServer({ open: [target({ status: "OPEN" })] });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText(/note/i), "re-ran verification readiness");
    await user.click(screen.getByRole("button", { name: /^resolve$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const postCall = mock.mock.calls.find(([url]) => String(url).endsWith("/resolve"));
    expect(JSON.parse((postCall?.[1] as RequestInit).body as string)).toEqual({
      note: "re-ran verification readiness",
    });

    expect(await screen.findByText("No open surveillance")).toBeInTheDocument();
  });

  it("closing Cancel leaves the target open and calls nothing", async () => {
    const { mock } = makeServer({ open: [target({ status: "OPEN" })] });
    vi.stubGlobal("fetch", mock);
    const user = userEvent.setup();

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mock.mock.calls.some(([url]) => String(url).endsWith("/resolve"))).toBe(false);
    expect(screen.getByText("Verification Readiness")).toBeInTheDocument();
  });
});

describe("honest messaging", () => {
  it("states plainly that the Sentinel never approves, rejects or rewrites anything", async () => {
    const { mock } = makeServer({ open: [] });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);

    expect(
      await screen.findByText(/it never approves, rejects, or rewrites anything/i),
    ).toBeInTheDocument();
  });

  it("shows no score, percentage or confidence anywhere in the workspace", async () => {
    const { mock } = makeServer({ open: [target()] });
    vi.stubGlobal("fetch", mock);

    render(<SentinelView projectId={PROJECT_ID} />);
    await screen.findByText("Verification Readiness");

    expect(document.body.textContent).not.toMatch(/\d+%|confidence|probability/i);
  });
});
