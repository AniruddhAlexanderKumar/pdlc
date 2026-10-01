import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  useSearchParams: () => new URLSearchParams(),
}));

const { ProjectsCard } = await import("./projects-card");

const NEW_PROJECT = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: "org1",
  name: "Garden irrigation controller",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
};

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProjectsCard", () => {
  it("starts the first project right from the dashboard and opens it", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST" ? ok({ project: NEW_PROJECT }) : ok({ projects: [] }),
    );
    const user = userEvent.setup();

    render(<ProjectsCard />);

    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Start your first project" }));
    await user.type(await screen.findByLabelText(/^Name/), NEW_PROJECT.name);
    await user.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/projects/${NEW_PROJECT.id}`));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1].body))).toMatchObject({ name: NEW_PROJECT.name });
  });

  it("offers a new project beside existing ones", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/progress") ? ok({}) : ok({ projects: [NEW_PROJECT] }),
    );

    render(<ProjectsCard />);

    expect(await screen.findByText(NEW_PROJECT.name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New project" })).toBeInTheDocument();
  });
});
