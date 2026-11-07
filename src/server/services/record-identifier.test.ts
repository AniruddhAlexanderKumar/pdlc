// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ValidationError } from "@/server/errors";

vi.mock("@/server/repositories/record-identifier.repository", () => ({
  listIdentifiersWithPrefix: vi.fn(),
}));

const repository = await import("@/server/repositories/record-identifier.repository");
const { withRecordIdentifier } = await import("./record-identifier");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("withRecordIdentifier", () => {
  it("uses the identifier the caller chose, without looking anything up", async () => {
    const create = vi.fn(async (identifier: string) => identifier);

    await expect(withRecordIdentifier("REQ-PROP-1", "requirement", PROJECT_ID, create)).resolves.toBe(
      "REQ-PROP-1",
    );
    expect(repository.listIdentifiersWithPrefix).not.toHaveBeenCalled();
  });

  it("numbers the record after the highest existing number in its scope", async () => {
    vi.mocked(repository.listIdentifiersWithPrefix).mockResolvedValue(["REQ-001", "REQ-007"]);
    const create = vi.fn(async (identifier: string) => identifier);

    await expect(withRecordIdentifier(undefined, "requirement", PROJECT_ID, create)).resolves.toBe("REQ-008");
    expect(repository.listIdentifiersWithPrefix).toHaveBeenCalledWith("requirement", PROJECT_ID, "REQ-");
  });

  it("treats an empty identifier as not given", async () => {
    vi.mocked(repository.listIdentifiersWithPrefix).mockResolvedValue([]);
    await expect(withRecordIdentifier("", "risk", PROJECT_ID, async (id) => id)).resolves.toBe("RSK-001");
  });

  it("re-picks the number after losing a race for it", async () => {
    vi.mocked(repository.listIdentifiersWithPrefix)
      .mockResolvedValueOnce(["REQ-001"])
      .mockResolvedValueOnce(["REQ-001", "REQ-002"]);
    const create = vi
      .fn<(identifier: string) => Promise<string>>()
      .mockRejectedValueOnce(new ConflictError("Requirement REQ-002 already exists in this project."))
      .mockImplementation(async (identifier) => identifier);

    await expect(withRecordIdentifier(undefined, "requirement", PROJECT_ID, create)).resolves.toBe("REQ-003");
    expect(create).toHaveBeenNthCalledWith(1, "REQ-002");
    expect(create).toHaveBeenNthCalledWith(2, "REQ-003");
  });

  it("gives up after three lost races rather than looping forever", async () => {
    // Each re-read shows the number just tried as taken by someone else.
    const taken: string[] = [];
    vi.mocked(repository.listIdentifiersWithPrefix).mockImplementation(async () => [...taken]);
    const create = vi.fn(async (identifier: string) => {
      taken.push(identifier);
      throw new ConflictError("taken");
    });

    await expect(withRecordIdentifier(undefined, "issue", PROJECT_ID, create)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(create).toHaveBeenCalledTimes(3);
  });

  it("does not retry a conflict that was about something other than the number", async () => {
    // The number is still free afterwards, so the conflict was not over it —
    // e.g. "a certification program already exists for this project".
    vi.mocked(repository.listIdentifiersWithPrefix).mockResolvedValue([]);
    const create = vi.fn(async () => {
      throw new ConflictError("A certification program already exists for this project.");
    });

    await expect(
      withRecordIdentifier(undefined, "certificationProgram", PROJECT_ID, create),
    ).rejects.toThrow("already exists for this project");
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("never retries a conflict on an identifier the caller chose", async () => {
    const create = vi.fn(async () => {
      throw new ConflictError("Requirement REQ-001 already exists in this project.");
    });

    await expect(withRecordIdentifier("REQ-001", "requirement", PROJECT_ID, create)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("does not retry any other kind of failure", async () => {
    vi.mocked(repository.listIdentifiersWithPrefix).mockResolvedValue([]);
    const create = vi.fn(async () => {
      throw new ValidationError("bad");
    });

    await expect(withRecordIdentifier(undefined, "risk", PROJECT_ID, create)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
