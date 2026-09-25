import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextProgressStep, progressSteps } from "@/domain/project-progress";
import { ProjectDetailView } from "./project-detail-view";

const PROJECT = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  name: "Upper Stage Propulsion",
  description: "Second stage engine integration",
  status: "ACTIVE" as const,
  createdAt: "2026-01-15T10:00:00.000Z",
  updatedAt: "2026-01-16T10:00:00.000Z",
};

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

function archiveCalls() {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/archive"));
}

/**
 * The page carries a technical-readiness panel, which reads two gate endpoints
 * of its own. These tests are about the project record, so the gate is answered
 * with the honest default — nobody has assessed it — and the panel renders its
 * no-assessment state without interfering.
 */
function isReadinessCall(url: unknown): boolean {
  return String(url).includes("/technical-readiness");
}

function readinessResponse(url: unknown): Response {
  return String(url).includes("/technical-readiness/latest")
    ? response(200, {
        latest: {
          status: "NOT_EVALUATED",
          projectId: PROJECT.id,
          gate: "SYSTEM_DEFINITION",
          readinessVersion: "1",
        },
      })
    : response(200, { assessments: [] });
}

/**
 * The page also carries the Decision Sentinel summary card, which reads the
 * project's real open/acknowledged counts. These tests are about the project
 * record and module list, so the honest default — nothing open — is used
 * unless a test overrides it.
 */
function isSentinelCountsCall(url: unknown): boolean {
  return String(url).endsWith("/sentinel");
}

function sentinelCountsResponse(counts: { open: number; acknowledged: number } = { open: 0, acknowledged: 0 }): Response {
  return response(200, { counts });
}

/**
 * The page also opens with the "next step" panel, which reads the project's
 * real progress counts. These tests are about the project record, so it is
 * answered with an empty project — whose next step is to write the first
 * requirement — unless a test overrides it.
 */
function isProgressCall(url: unknown): boolean {
  return String(url).endsWith("/progress");
}

function progressResponse(): Response {
  const counts = {
    stakeholderNeeds: 0,
    requirements: 0,
    requirementsWithoutCheck: 0,
    verificationActivities: 0,
    checksWithoutProof: 0,
    openChanges: 0,
  };
  return response(200, {
    progress: { counts, steps: progressSteps(counts), next: nextProgressStep(counts) },
  });
}

/**
 * Answers the project endpoint with `project`, and the gate/sentinel/progress
 * endpoints with their own shapes. Mirrors `mockResolvedValue` for the
 * project call so the existing expectations about repeated reads still hold.
 */
function routeProject(project: unknown) {
  fetchMock.mockImplementation(async (url: unknown) => {
    if (isReadinessCall(url)) return readinessResponse(url);
    if (isSentinelCountsCall(url)) return sentinelCountsResponse();
    if (isProgressCall(url)) return progressResponse();
    return response(200, { project });
  });
}

/** As above, with one mutating call answered by `onMutate`. */
function routeProjectWithMutation(
  project: unknown,
  method: string,
  mutated: unknown,
) {
  fetchMock.mockImplementation(async (url: unknown, init?: RequestInit) => {
    if (isReadinessCall(url)) return readinessResponse(url);
    if (isSentinelCountsCall(url)) return sentinelCountsResponse();
    if (isProgressCall(url)) return progressResponse();
    if (init?.method === method) return response(200, { project: mutated });
    return response(200, { project });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectDetailView", () => {
  it("renders the project record from the API", async () => {
    routeProject(PROJECT);

    render(<ProjectDetailView projectId={PROJECT.id} />);

    expect(await screen.findByRole("heading", { name: PROJECT.name })).toBeInTheDocument();
    expect(screen.getByText("2026-01-15")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/projects/${PROJECT.id}`);
  });

  it("explains a missing project instead of leaking the raw API error", async () => {
    fetchMock.mockResolvedValue(
      response(404, { error: { code: "NOT_FOUND", message: "Project xyz was not found." } }),
    );

    render(<ProjectDetailView projectId={PROJECT.id} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i);
    expect(screen.getByRole("link", { name: /back to projects/i })).toBeInTheDocument();
  });

  it("prevents editing an archived project", async () => {
    routeProject({ ...PROJECT, status: "ARCHIVED" });

    render(<ProjectDetailView projectId={PROJECT.id} />);

    expect(await screen.findByRole("button", { name: /edit/i })).toBeDisabled();
    // Archive is not offered twice, and the read-only state is stated in text.
    expect(screen.queryByRole("button", { name: /^archive$/i })).not.toBeInTheDocument();
    // The page carries more than one live region now that the gate panel sits
    // below, so this asserts the archived notice specifically.
    expect(
      screen
        .getAllByRole("status")
        .some((notice) => /archived and read-only/i.test(notice.textContent ?? "")),
    ).toBe(true);
  });

  it("updates in place from the API response after an edit", async () => {
    const user = userEvent.setup();
    routeProjectWithMutation(PROJECT, "PATCH", {
      ...PROJECT,
      name: "Upper Stage Propulsion B",
    });

    render(<ProjectDetailView projectId={PROJECT.id} />);
    await screen.findByRole("heading", { name: PROJECT.name });

    await user.click(screen.getByRole("button", { name: /edit/i }));
    const nameField = await screen.findByLabelText(/^name/i);
    await user.clear(nameField);
    await user.type(nameField, "Upper Stage Propulsion B");

    await user.click(screen.getByRole("button", { name: /save changes/i }));

    expect(
      await screen.findByRole("heading", { name: "Upper Stage Propulsion B" }),
    ).toBeInTheDocument();

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toBe(`/api/projects/${PROJECT.id}`);
  });

  it("does not archive when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    routeProject(PROJECT);

    render(<ProjectDetailView projectId={PROJECT.id} />);
    await screen.findByRole("heading", { name: PROJECT.name });

    await user.click(screen.getByRole("button", { name: /^archive$/i }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(/cannot be undone/i);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(archiveCalls()).toHaveLength(0);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("archives only after explicit confirmation and shows the new status", async () => {
    const user = userEvent.setup();
    routeProjectWithMutation(PROJECT, "POST", { ...PROJECT, status: "ARCHIVED" });

    render(<ProjectDetailView projectId={PROJECT.id} />);
    await screen.findByRole("heading", { name: PROJECT.name });

    await user.click(screen.getByRole("button", { name: /^archive$/i }));
    expect(archiveCalls()).toHaveLength(0); // opening the dialog sends nothing

    await user.click(await screen.findByRole("button", { name: /archive project/i }));

    expect(await screen.findByText("Archived")).toBeInTheDocument();
    expect(archiveCalls()).toHaveLength(1);
    expect(archiveCalls()[0]?.[1].method).toBe("POST");
    // The freshly archived project is immediately read-only.
    expect(screen.getByRole("button", { name: /edit/i })).toBeDisabled();
  });

  it("lists Decision Sentinel as an engineering workspace module, linking to its own page", async () => {
    routeProject(PROJECT);

    render(<ProjectDetailView projectId={PROJECT.id} />);
    await screen.findByRole("heading", { name: PROJECT.name });

    // Appears twice: once as the module row, once as the summary card's title.
    expect(screen.getAllByText("Decision Sentinel").length).toBeGreaterThanOrEqual(1);
    const openLinks = screen.getAllByRole("link", { name: /^open$/i });
    const sentinelLink = openLinks.find((link) =>
      link.getAttribute("href")?.endsWith("/sentinel"),
    );
    expect(sentinelLink).toHaveAttribute("href", `/projects/${PROJECT.id}/sentinel`);
  });

  it("shows an honest empty state on the Decision Sentinel card when nothing is open", async () => {
    routeProject(PROJECT);

    render(<ProjectDetailView projectId={PROJECT.id} />);
    await screen.findByRole("heading", { name: PROJECT.name });

    expect(await screen.findByText(/no open surveillance signals/i)).toBeInTheDocument();
  });

  it("shows real open and acknowledged surveillance counts, never a fabricated score", async () => {
    fetchMock.mockImplementation(async (url: unknown) => {
      if (isReadinessCall(url)) return readinessResponse(url);
      if (isSentinelCountsCall(url)) return sentinelCountsResponse({ open: 3, acknowledged: 1 });
      if (isProgressCall(url)) return progressResponse();
      return response(200, { project: PROJECT });
    });

    render(<ProjectDetailView projectId={PROJECT.id} />);
    await screen.findByRole("heading", { name: PROJECT.name });

    expect(await screen.findByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\d+%|confidence|risk score/i);
  });
});
