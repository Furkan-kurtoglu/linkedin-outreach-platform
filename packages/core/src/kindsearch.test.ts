import { describe, expect, it } from "vitest";
import { ALL_KINDS, KIND_SEARCH, parseKinds } from "./kindsearch";

describe("kindsearch", () => {
  it("her aranabilir türün sözcüğü var, sigorta il il aranmaz", () => {
    for (const k of Object.keys(KIND_SEARCH)) expect(KIND_SEARCH[k as keyof typeof KIND_SEARCH]!.keywords.length).toBeGreaterThan(1);
    expect(KIND_SEARCH.INSURER?.byCity).toBe(false);
    expect(KIND_SEARCH.HOSPITAL?.byCity).toBe(true);
  });
  it("geçersiz türleri atar", () => {
    expect(parseKinds(["HOSPITAL", "X", 3, "CLINIC"])).toEqual(["HOSPITAL", "CLINIC"]);
    expect(parseKinds("HOSPITAL")).toEqual([]);
    expect(ALL_KINDS).toContain("OTHER");
  });
});
