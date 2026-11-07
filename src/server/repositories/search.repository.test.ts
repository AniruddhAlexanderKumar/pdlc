// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { SEARCH_ENTITY_TYPES } from "@/domain/search";

vi.mock("@/lib/db", () => ({ prisma: {} }));

const {
  SEARCHABLE_ENTITIES,
  searchIndexStatements,
  tsvectorExpression,
} = await import("./search.repository");

const MIGRATION = readFileSync(
  join(process.cwd(), "prisma/migrations/20260916184500_add_full_text_search/migration.sql"),
  "utf8",
);

/**
 * The registry is the single description of what is searchable, and three
 * separate things read it: the query, the migration, and the domain's own
 * type list. These tests exist because each pair can drift silently rather
 * than loudly — a missing index does not error, it just makes search slow
 * enough to look like a different problem entirely.
 */
describe("searchable entity registry", () => {
  it("covers exactly the entity types the domain declares — no more, no fewer", () => {
    const registered = SEARCHABLE_ENTITIES.map((entity) => entity.type).sort();
    expect(registered).toEqual([...SEARCH_ENTITY_TYPES].sort());
  });

  it("registers each type once", () => {
    const types = SEARCHABLE_ENTITIES.map((entity) => entity.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("gives every entity a route to a project id", () => {
    for (const entity of SEARCHABLE_ENTITIES) {
      // Either the row carries projectId itself, or joins must reach one.
      if (entity.projectJoin === "") {
        expect(entity.projectIdExpr).toBe('e."projectId"');
      } else {
        expect(entity.projectJoin).toContain("JOIN");
        expect(entity.projectIdExpr).not.toBe('e."projectId"');
      }
    }
  });

  /**
   * `Prisma.raw` splices SQL text unescaped, and the registry is the only
   * thing the repository ever hands it. Nothing here is derived from a
   * request, and this asserts the shape stays that way: plain snake_case
   * identifiers and join clauses built from them, with no quote, semicolon,
   * comment marker, or parameter placeholder that could change the meaning
   * of the statement it is spliced into.
   */
  it("contains only plain SQL identifiers, so nothing spliced raw can alter a statement", () => {
    const identifier = /^[a-z][a-z0-9_]*$/;
    const identifierWithCamel = /^[a-zA-Z][a-zA-Z0-9_]*$/;

    for (const entity of SEARCHABLE_ENTITIES) {
      expect(entity.table).toMatch(identifier);
      expect(entity.titleColumn).toMatch(identifierWithCamel);
      for (const body of entity.bodyColumns) expect(body).toMatch(identifierWithCamel);
      if (entity.ownerColumn) expect(entity.ownerColumn).toMatch(identifierWithCamel);

      for (const fragment of [entity.projectJoin, entity.projectIdExpr]) {
        expect(fragment).not.toMatch(/;|--|\/\*|\$\d/);
        expect(fragment.replace(/"/g, "")).toMatch(/^[a-zA-Z0-9_. =]*$/);
      }
    }
  });
});

describe("tsvectorExpression", () => {
  it("weights the identifier above the title, and the title above the body", () => {
    const requirement = SEARCHABLE_ENTITIES.find((entity) => entity.type === "REQUIREMENT")!;
    const expression = tsvectorExpression(requirement, "e.");

    expect(expression).toContain(`setweight(to_tsvector('simple', coalesce(e."identifier", '')), 'A')`);
    expect(expression).toContain(`setweight(to_tsvector('english', coalesce(e."title", '')), 'B')`);
    expect(expression).toContain(`setweight(to_tsvector('english', coalesce(e."statement", '')), 'C')`);
  });

  it("indexes the identifier with the 'simple' configuration — stemming an identifier helps nobody", () => {
    for (const entity of SEARCHABLE_ENTITIES) {
      expect(tsvectorExpression(entity, "")).toContain(`to_tsvector('simple', coalesce("identifier", '')`);
    }
  });

  it("differs from the indexed form only by the alias", () => {
    for (const entity of SEARCHABLE_ENTITIES) {
      const indexed = tsvectorExpression(entity, "");
      const queried = tsvectorExpression(entity, "e.");
      expect(queried.replaceAll('e."', '"')).toBe(indexed);
    }
  });
});

/**
 * The reason this file exists at all.
 *
 * PostgreSQL uses an expression index only when the query's expression is
 * identical to the indexed one. A change to `tsvectorExpression` that is not
 * carried into the migration does not fail, raise, or warn — it silently
 * turns every search into a sequential scan across eighteen tables. This
 * catches that at the one moment it is cheap to fix.
 */
describe("the committed migration", () => {
  it("contains every index statement the registry currently generates", () => {
    for (const statement of searchIndexStatements()) {
      expect(MIGRATION).toContain(statement);
    }
  });

  it("creates two indexes per searchable entity — full text and identifier trigram", () => {
    expect(searchIndexStatements()).toHaveLength(SEARCHABLE_ENTITIES.length * 2);
  });

  it("enables pg_trgm, without which partial identifier matching cannot work", () => {
    expect(MIGRATION).toContain("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
  });
});
