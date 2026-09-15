import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Driven through the real API client with a faked `fetch` — request shapes
 * are genuinely exercised, including the PATCH body an owner's edit sends.
 */

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, replace: vi.fn(), push: vi.fn() }),
}));

const { OrganizationProfileView } = await import("./organization-profile-view");

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const UNSET_PROFILE = {
  id: "org1aaaaaaaaaaaaaaaaaaaa",
  name: "Example Aerospace",
  industry: null,
  industryOtherDetail: null,
  industrySetAt: null,
  industrySetBy: null,
  labelOverrides: {},
  labelOverridesSetAt: null,
  labelOverridesSetBy: null,
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrganizationProfileView", () => {
  it("shows a genuine 'not set' state for a non-owner, with no editable form", async () => {
    fetchMock.mockImplementation(async () => ok({ profile: UNSET_PROFILE }));

    render(<OrganizationProfileView isOwner={false} />);

    expect(await screen.findByText("Not set. Only an organization owner can set it.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Industry")).not.toBeInTheDocument();
  });

  it("lets an owner set the industry, and sends exactly that in the PATCH body", async () => {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname;
      if (path === "/api/organization/profile" && init?.method === "PATCH") {
        return ok({
          profile: {
            ...UNSET_PROFILE,
            industry: "AEROSPACE_DEFENSE",
            industrySetAt: "2026-01-01T00:00:00.000Z",
            industrySetBy: { id: "user1", name: "Ada Lovelace" },
          },
        });
      }
      return ok({ profile: UNSET_PROFILE });
    });

    const user = userEvent.setup();
    render(<OrganizationProfileView isOwner />);

    await user.selectOptions(await screen.findByLabelText("Industry"), "AEROSPACE_DEFENSE");
    const industryCard = screen.getByText("Engineering industry").closest(".rounded-lg") as HTMLElement;
    await user.click(within(industryCard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, init]) => {
          const requestInit = init as RequestInit | undefined;
          if (requestInit?.method !== "PATCH" || !requestInit.body) return false;
          const body = JSON.parse(String(requestInit.body));
          return body.industry === "AEROSPACE_DEFENSE" && body.otherDetail === undefined;
        }),
      ).toBe(true);
    });

    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
  });

  it("requires a detail before Other engineering discipline can be saved", async () => {
    fetchMock.mockImplementation(async () => ok({ profile: UNSET_PROFILE }));
    const user = userEvent.setup();
    render(<OrganizationProfileView isOwner />);

    await user.selectOptions(await screen.findByLabelText("Industry"), "OTHER_ENGINEERING");
    const industryCard = screen.getByText("Engineering industry").closest(".rounded-lg") as HTMLElement;

    expect(within(industryCard).getByRole("button", { name: "Save" })).toBeDisabled();

    await user.type(screen.getByLabelText("Describe the discipline"), "Marine renewables");

    expect(within(industryCard).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows a genuine 'nothing renamed' state for a non-owner, with no editable terminology form", async () => {
    fetchMock.mockImplementation(async () => ok({ profile: UNSET_PROFILE }));

    render(<OrganizationProfileView isOwner={false} />);

    expect(await screen.findByText("No terms have been renamed. Only an organization owner can rename them.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Risks")).not.toBeInTheDocument();
  });

  it("lets an owner rename a term, sends exactly that in the PATCH body, and refreshes the server tree so the sidebar picks it up", async () => {
    fetchMock.mockImplementation(async (input: string, init?: RequestInit) => {
      const path = new URL(String(input), "http://localhost").pathname;
      if (path === "/api/organization/terminology" && init?.method === "PATCH") {
        return ok({
          profile: {
            ...UNSET_PROFILE,
            labelOverrides: { risk: "Hazard" },
            labelOverridesSetAt: "2026-01-01T00:00:00.000Z",
            labelOverridesSetBy: { id: "user1", name: "Ada Lovelace" },
          },
        });
      }
      return ok({ profile: UNSET_PROFILE });
    });

    const user = userEvent.setup();
    render(<OrganizationProfileView isOwner />);

    const riskField = await screen.findByLabelText("Risks");
    await user.type(riskField, "Hazard");
    // Save is shared across all fourteen fields — narrow to the one this
    // test actually changed via the terminology card's own heading.
    const terminologyCard = screen.getByText("Terminology").closest(".rounded-lg") as HTMLElement;
    await user.click(within(terminologyCard).getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([, init]) => {
          const requestInit = init as RequestInit | undefined;
          if (requestInit?.method !== "PATCH" || !requestInit.body) return false;
          const body = JSON.parse(String(requestInit.body));
          return body.overrides?.risk === "Hazard";
        }),
      ).toBe(true);
    });

    expect(await screen.findByText(/Ada Lovelace/)).toBeInTheDocument();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("Save stays disabled until a field actually changes", async () => {
    fetchMock.mockImplementation(async () => ok({ profile: UNSET_PROFILE }));
    render(<OrganizationProfileView isOwner />);

    await screen.findByLabelText("Risks");
    const terminologyCard = screen.getByText("Terminology").closest(".rounded-lg") as HTMLElement;
    expect(within(terminologyCard).getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
