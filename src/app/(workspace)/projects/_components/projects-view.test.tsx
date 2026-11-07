import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsView } from "./projects-view";

/**
 * These drive the real API client and hooks through a faked `fetch`, so the
 * request shapes, error-envelope handling and refresh behavior are all
 * genuinely exercised — only the network is replaced.
 */

const ACTIVE_PROJECT = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  name: "Upper Stage Propulsion",
  description: "Second stage engine integration",
  status: "ACTIVE" as const,
  createdAt: "2026-01-15T10:00:00.000Z",
  updatedAt: "2026-01-16T10:00:00.000Z",
};

const ARCHIVED_PROJECT = {
  ...ACTIVE_PROJECT,
  id: "proj2bbbbbbbbbbbbbbbbbbb",
  name: "Legacy Airframe Study",
  description: null,
  status: "ARCHIVED" as const,
};

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectsView", () => {
  it("shows a genuine empty state, not a zero count, when there are no projects", async () => {
    fetchMock.mockResolvedValue(response(200, { projects: [] }));

    render(<ProjectsView />);

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders rows from the fetched response, including archived projects with their status", async () => {
    fetchMock.mockResolvedValue(
      response(200, { projects: [ACTIVE_PROJECT, ARCHIVED_PROJECT] }),
    );

    render(<ProjectsView />);

    const activeRow = (await screen.findByRole("link", { name: "Upper Stage Propulsion" })).closest(
      "tr",
    )!;
    expect(within(activeRow).getByText("Active")).toBeInTheDocument();
    expect(within(activeRow).getByText("2026-01-15")).toBeInTheDocument();

    // Archived projects stay listed rather than vanishing from the workspace.
    const archivedRow = (await screen.findByRole("link", { name: "Legacy Airframe Study" })).closest(
      "tr",
    )!;
    expect(within(archivedRow).getByText("Archived")).toBeInTheDocument();
  });

  it("surfaces a load failure with a retry that refetches", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(
      response(500, { error: { code: "INTERNAL_ERROR", message: "boom" } }),
    );

    render(<ProjectsView />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/something went wrong on the server/i);
    // The internal failure text is never shown to the user.
    expect(alert).not.toHaveTextContent("boom");

    fetchMock.mockResolvedValueOnce(response(200, { projects: [ACTIVE_PROJECT] }));
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("link", { name: "Upper Stage Propulsion" })).toBeInTheDocument();
  });

  it("rejects a blank name in the create form without calling the API", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(response(200, { projects: [] }));

    render(<ProjectsView />);
    await screen.findByText("No projects yet");

    await user.click(screen.getAllByRole("button", { name: /new project/i })[0]!);
    await user.click(await screen.findByRole("button", { name: /create project/i }));

    expect(await screen.findByText("A project name is required")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("creates a project, closes the dialog and refreshes the list from the API", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(response(200, { projects: [] }));

    render(<ProjectsView />);
    await screen.findByText("No projects yet");

    await user.click(screen.getAllByRole("button", { name: /new project/i })[0]!);
    await user.type(await screen.findByLabelText(/name/i), "Upper Stage Propulsion");

    // Creation response, then the refreshed list.
    fetchMock.mockResolvedValueOnce(response(201, { project: ACTIVE_PROJECT }));
    fetchMock.mockResolvedValueOnce(response(200, { projects: [ACTIVE_PROJECT] }));

    await user.click(screen.getByRole("button", { name: /create project/i }));

    // The row appears because the list was refetched, not because it was
    // optimistically inserted client-side.
    expect(await screen.findByRole("link", { name: "Upper Stage Propulsion" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall?.[0]).toBe("/api/projects");
    expect(JSON.parse(postCall?.[1].body)).toEqual({
      name: "Upper Stage Propulsion",
      description: null,
    });
  });

  it("displays a server validation error and keeps the dialog open", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValueOnce(response(200, { projects: [] }));

    render(<ProjectsView />);
    await screen.findByText("No projects yet");

    await user.click(screen.getAllByRole("button", { name: /new project/i })[0]!);
    await user.type(await screen.findByLabelText(/name/i), "Duplicate Program");

    fetchMock.mockResolvedValueOnce(
      response(409, {
        error: {
          code: "CONFLICT",
          message: 'A project named "Duplicate Program" already exists in this organization.',
        },
      }),
    );

    await user.click(screen.getByRole("button", { name: /create project/i }));

    expect(await screen.findByText(/already exists in this organization/i)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
