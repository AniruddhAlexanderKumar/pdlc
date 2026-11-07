import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, describeApiError, requestJson } from "./client";

/**
 * `requestJson` is how 189 call sites read the API, so its failure modes
 * are every view's failure modes.
 */

const fetchMock = vi.fn();

function respond(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("requestJson", () => {
  it("returns the named field of a successful response", async () => {
    fetchMock.mockResolvedValue(respond(200, { project: { id: "p1" } }));

    await expect(requestJson("/api/projects/p1", "project")).resolves.toEqual({ id: "p1" });
  });

  /**
   * The defect this fixes. A 2xx response missing the expected field used to
   * resolve as a *success* carrying `undefined`; the view, believing it had
   * data, then threw while rendering and took the whole page down. It is a
   * broken contract and now surfaces as one, in the error state every view
   * already knows how to show.
   */
  it("reports a response missing the expected field as an error, not as empty data", async () => {
    fetchMock.mockResolvedValue(respond(200, { project: { id: "p1" } }));

    const failure = await requestJson("/api/projects/p1/progress", "progress").catch((e) => e);

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).code).toBe("MALFORMED_RESPONSE");
  });

  /**
   * Several endpoints answer `{ latest: null }` to mean "nothing assessed
   * yet". Present-but-null is a real answer and must arrive intact.
   */
  it("passes a field that is present but null through untouched", async () => {
    fetchMock.mockResolvedValue(respond(200, { latest: null }));

    await expect(requestJson("/api/projects/p1/drift/latest", "latest")).resolves.toBeNull();
  });

  it("reports a successful response with no JSON body as an error", async () => {
    fetchMock.mockResolvedValue(new Response("<html>proxy page</html>", { status: 200 }));

    await expect(requestJson("/api/projects", "projects")).rejects.toBeInstanceOf(ApiError);
  });

  it("tells the reader something went wrong, without the internal detail", async () => {
    fetchMock.mockResolvedValue(respond(200, {}));

    const failure = await requestJson("/api/projects", "projects").catch((e) => e);

    expect(describeApiError(failure)).toBe("Something went wrong on the server. Please try again.");
  });

  it("still surfaces the server's own error envelope on a failed status", async () => {
    fetchMock.mockResolvedValue(respond(404, { error: { code: "NOT_FOUND", message: "gone" } }));

    const failure = await requestJson("/api/projects/p9", "project").catch((e) => e);

    expect((failure as ApiError).code).toBe("NOT_FOUND");
    expect((failure as ApiError).status).toBe(404);
  });
});
