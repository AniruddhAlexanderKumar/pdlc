import { describe, expect, it } from "vitest";
import {
  HISTORY_OBJECT_TYPES,
  HISTORY_PAGE_DEFAULT_LIMIT,
  HISTORY_PAGE_MAX_LIMIT,
  HISTORY_SOURCE_MODULES,
  type HistoryEvent,
  clampHistoryLimit,
  clampHistoryOffset,
  compareHistoryEvents,
  dedupeHistoryEvents,
  historyEventLabel,
  historyObjectTypeSchema,
  historySourceModuleLabel,
  isHistoryObjectType,
  paginateHistoryEvents,
} from "./engineering-history";
import { GRAPH_NODE_TYPES, type GraphNodeType } from "./graph";

function event(overrides: Partial<HistoryEvent> = {}): HistoryEvent {
  return {
    key: "REQUIREMENT:Requirement:r1:requirement.created:2026-01-01T00:00:00.000Z:aud1",
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
    category: "CONTENT_CHANGE",
    sourceModule: "REQUIREMENT",
    sourceType: "REQUIREMENT",
    sourceId: "r1",
    sourceIdentifier: "REQ-001",
    sourceLabel: "Chamber pressure",
    action: "requirement.created",
    label: "Created",
    actorId: "user1",
    actorName: "Ada",
    detail: null,
    href: "/projects/p1/requirements/r1",
    ...overrides,
  };
}

describe("HISTORY_OBJECT_TYPES", () => {
  it("is a subset of the real graph node type registry, with no invented type", () => {
    for (const type of HISTORY_OBJECT_TYPES) {
      expect(GRAPH_NODE_TYPES).toContain(type as GraphNodeType);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(HISTORY_OBJECT_TYPES).size).toBe(HISTORY_OBJECT_TYPES.length);
  });

  it("parses every declared type through its schema and rejects an arbitrary string", () => {
    for (const type of HISTORY_OBJECT_TYPES) {
      expect(historyObjectTypeSchema.parse(type)).toBe(type);
      expect(isHistoryObjectType(type)).toBe(true);
    }
    expect(() => historyObjectTypeSchema.parse("evidence_link")).toThrow();
    expect(() => historyObjectTypeSchema.parse("AuditLog")).toThrow();
    expect(isHistoryObjectType("DRIFT_ASSESSMENT")).toBe(false);
  });
});

describe("HISTORY_SOURCE_MODULES", () => {
  it("has no duplicate entries and gives every module a readable label", () => {
    expect(new Set(HISTORY_SOURCE_MODULES).size).toBe(HISTORY_SOURCE_MODULES.length);
    for (const sourceModule of HISTORY_SOURCE_MODULES) {
      const label = historySourceModuleLabel(sourceModule);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toMatch(/_/);
    }
  });
});

describe("compareHistoryEvents", () => {
  it("orders strictly newer events first", () => {
    const older = event({ key: "a", timestamp: new Date("2026-01-01T00:00:00.000Z") });
    const newer = event({ key: "b", timestamp: new Date("2026-02-01T00:00:00.000Z") });
    expect(compareHistoryEvents(newer, older)).toBeLessThan(0);
    expect(compareHistoryEvents(older, newer)).toBeGreaterThan(0);
  });

  it("breaks a tie on identical timestamps by the stable key, never by insertion order", () => {
    const t = new Date("2026-01-01T00:00:00.000Z");
    const a = event({ key: "AAA", timestamp: t });
    const b = event({ key: "ZZZ", timestamp: t });
    expect(compareHistoryEvents(a, b)).toBeLessThan(0);
    expect(compareHistoryEvents(b, a)).toBeGreaterThan(0);
    expect(compareHistoryEvents(a, a)).toBe(0);
  });

  it("produces the same order regardless of the input array's starting order", () => {
    const t = new Date("2026-01-01T00:00:00.000Z");
    const events = [event({ key: "c", timestamp: t }), event({ key: "a", timestamp: t }), event({ key: "b", timestamp: t })];
    const sortedOnce = [...events].sort(compareHistoryEvents).map((e) => e.key);
    const sortedReversed = [...events].reverse().sort(compareHistoryEvents).map((e) => e.key);
    expect(sortedOnce).toEqual(["a", "b", "c"]);
    expect(sortedReversed).toEqual(["a", "b", "c"]);
  });
});

describe("dedupeHistoryEvents", () => {
  it("keeps only the first occurrence of a repeated key", () => {
    const first = event({ key: "dup", sourceLabel: "first" });
    const second = event({ key: "dup", sourceLabel: "second" });
    const result = dedupeHistoryEvents([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]!.sourceLabel).toBe("first");
  });

  it("never produces two events with the same key", () => {
    const events = [event({ key: "a" }), event({ key: "b" }), event({ key: "a" }), event({ key: "c" }), event({ key: "b" })];
    const result = dedupeHistoryEvents(events);
    expect(new Set(result.map((e) => e.key)).size).toBe(result.length);
    expect(result).toHaveLength(3);
  });
});

describe("clampHistoryLimit / clampHistoryOffset", () => {
  it("defaults an absent or invalid limit rather than throwing", () => {
    expect(clampHistoryLimit(undefined)).toBe(HISTORY_PAGE_DEFAULT_LIMIT);
    expect(clampHistoryLimit(Number.NaN)).toBe(HISTORY_PAGE_DEFAULT_LIMIT);
    expect(clampHistoryLimit(0)).toBe(HISTORY_PAGE_DEFAULT_LIMIT);
    expect(clampHistoryLimit(-5)).toBe(HISTORY_PAGE_DEFAULT_LIMIT);
  });

  it("never returns more than the hard cap, regardless of what is requested", () => {
    expect(clampHistoryLimit(HISTORY_PAGE_MAX_LIMIT + 10_000)).toBe(HISTORY_PAGE_MAX_LIMIT);
  });

  it("clamps a negative or invalid offset to zero", () => {
    expect(clampHistoryOffset(undefined)).toBe(0);
    expect(clampHistoryOffset(-1)).toBe(0);
    expect(clampHistoryOffset(Number.NaN)).toBe(0);
    expect(clampHistoryOffset(10)).toBe(10);
  });
});

describe("paginateHistoryEvents", () => {
  const events = Array.from({ length: 5 }, (_, i) =>
    event({ key: `k${i}`, timestamp: new Date(2026, 0, i + 1) }),
  );

  it("sorts before slicing, so pagination is over the deterministic order, not insertion order", () => {
    const shuffled = [events[3]!, events[0]!, events[4]!, events[1]!, events[2]!];
    const { events: page } = paginateHistoryEvents(shuffled, 0, 2);
    // Newest first: index 4 (Jan 5) then index 3 (Jan 4).
    expect(page.map((e) => e.key)).toEqual(["k4", "k3"]);
  });

  it("reports total and hasMore correctly across page boundaries", () => {
    const first = paginateHistoryEvents(events, 0, 2);
    expect(first.page).toEqual({ offset: 0, limit: 2, total: 5, hasMore: true });

    const last = paginateHistoryEvents(events, 4, 2);
    expect(last.page).toEqual({ offset: 4, limit: 2, total: 5, hasMore: false });
    expect(last.events).toHaveLength(1);
  });

  it("returns an empty page, not an error, for an offset past the end", () => {
    const { events: page, page: meta } = paginateHistoryEvents(events, 50, 10);
    expect(page).toEqual([]);
    expect(meta.hasMore).toBe(false);
    expect(meta.total).toBe(5);
  });
});

describe("historyEventLabel", () => {
  it("strips the module prefix and maps a known suffix to a human label", () => {
    expect(historyEventLabel("requirement.created")).toBe("Created");
    expect(historyEventLabel("risk.status_transitioned")).toBe("Status changed");
    expect(historyEventLabel("evidence.validated")).toBe("Validated");
    expect(historyEventLabel("baseline.activated")).toBe("Activated");
  });

  it("falls back to the raw action for an unrecognized suffix, never a blank label", () => {
    expect(historyEventLabel("widget.frobnicated")).toBe("widget.frobnicated");
  });

  it("handles an action with no module prefix at all", () => {
    expect(historyEventLabel("evaluated")).toBe("Evaluated");
  });
});
