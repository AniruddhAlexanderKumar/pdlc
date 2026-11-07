// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The one lifecycle hook Next.js calls automatically. Two things are worth
 * proving without actually starting a server or killing the test process:
 * that it does nothing outside the Node runtime (an Edge bundle, were one
 * ever built, would also load this file), and that a shutdown signal actually
 * closes the database connection before the process would exit.
 */

vi.mock("@/config/env", () => ({
  env: { NODE_ENV: "production", LOG_LEVEL: "info", SESSION_TTL_DAYS: 30 },
}));

const log = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
vi.mock("@/lib/logger", () => ({ logger: { child: () => log } }));

const prisma = { $disconnect: vi.fn(async () => undefined) };
vi.mock("@/lib/db", () => ({ prisma }));

let originalRuntime: string | undefined;
let onSpy: ReturnType<typeof vi.spyOn>;
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  originalRuntime = process.env.NEXT_RUNTIME;
  onSpy = vi.spyOn(process, "on").mockImplementation(() => process);
  exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});

afterEach(() => {
  if (originalRuntime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = originalRuntime;
});

describe("register()", () => {
  it("does nothing outside the Node runtime — an Edge bundle would also load this file", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("./instrumentation");

    await register();

    expect(log.info).not.toHaveBeenCalled();
    expect(onSpy).not.toHaveBeenCalled();
  });

  it("logs startup with no secret values, and registers SIGTERM/SIGINT handlers", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("./instrumentation");

    await register();

    expect(log.info).toHaveBeenCalledWith(
      "Application starting",
      expect.objectContaining({ nodeEnv: "production" }),
    );
    const loggedContext = log.info.mock.calls[0]?.[1];
    expect(JSON.stringify(loggedContext)).not.toMatch(/postgresql:|password|secret/i);

    expect(onSpy).toHaveBeenCalledWith("SIGTERM", expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith("SIGINT", expect.any(Function));
  });

  it("closes the database connection and exits cleanly on SIGTERM", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("./instrumentation");
    await register();

    const sigtermHandler = onSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "SIGTERM",
    )?.[1] as () => unknown;
    await sigtermHandler();

    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("is idempotent — a second signal while already shutting down does not disconnect twice", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("./instrumentation");
    await register();

    const sigtermHandler = onSpy.mock.calls.find(
      (call: unknown[]) => call[0] === "SIGTERM",
    )?.[1] as () => unknown;
    await sigtermHandler();
    await sigtermHandler();

    expect(prisma.$disconnect).toHaveBeenCalledTimes(1);
  });
});
