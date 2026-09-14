import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Driven through the real API client with a faked `fetch` — request shapes
 * are genuinely exercised, including the PATCH body an owner's edit sends.
 */

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
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
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
    await user.click(screen.getByRole("button", { name: "Save" }));

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

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.type(screen.getByLabelText("Describe the discipline"), "Marine renewables");

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });
});
