import { describe, expect, it } from "vitest";
import { OFFICIAL_INTEGRATIONS_CATALOG } from "./integration";

describe("OFFICIAL_INTEGRATIONS_CATALOG", () => {
  it("includes Amazon Store & Business API as an official integration provider", () => {
    const amazon = OFFICIAL_INTEGRATIONS_CATALOG.find((item) => item.provider === "AMAZON_STORE");
    expect(amazon).toBeDefined();
    expect(amazon?.name).toBe("Amazon Store & Business API");
    expect(amazon?.officialBadge).toBe("Official Store Integration");
  });

  it("defines 5 official integrations", () => {
    expect(OFFICIAL_INTEGRATIONS_CATALOG.length).toBe(5);
  });
});
