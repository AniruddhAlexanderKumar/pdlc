// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GRAPH_EDGE_DEFINITIONS, GRAPH_EDGE_TYPES } from "@/domain";
import { EDGE_RESOLVERS } from "./graph-edge-resolvers";

/**
 * The registry and the resolvers have to stay in step: the registry says what
 * an edge means, the resolvers say how to read it, and a type present in one
 * but not the other is a silently missing part of the graph.
 */
describe("the resolver registry", () => {
  it("has a resolver for every declared edge type", () => {
    expect(Object.keys(EDGE_RESOLVERS).sort()).toEqual([...GRAPH_EDGE_TYPES].sort());
  });

  it("keys every resolver by its own edge type", () => {
    for (const [key, resolver] of Object.entries(EDGE_RESOLVERS)) {
      expect(resolver.type).toBe(key);
    }
  });

  it("gives every resolver all three reads", () => {
    for (const resolver of Object.values(EDGE_RESOLVERS)) {
      expect(typeof resolver.outgoing).toBe("function");
      expect(typeof resolver.incoming).toBe("function");
      expect(typeof resolver.audit).toBe("function");
    }
  });

  it("declares a resolver for exactly the types the definitions declare", () => {
    expect(Object.keys(EDGE_RESOLVERS).sort()).toEqual(Object.keys(GRAPH_EDGE_DEFINITIONS).sort());
  });
});
