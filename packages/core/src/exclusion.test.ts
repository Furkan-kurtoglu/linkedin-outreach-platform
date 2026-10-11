import { describe, expect, it } from "vitest";
import { matchesExcludedCompany } from "./text";

describe("hariç kurum kuralı", () => {
  it("düz kural kurum adında geçeni eler", () => {
    expect(matchesExcludedCompany("Acıbadem Sağlık Grubu", "Acıbadem")).toBe(true);
    expect(matchesExcludedCompany("Memorial", "Acıbadem")).toBe(false);
  });
  it("istisnalı kural istisnayı eşleştirmez", () => {
    expect(matchesExcludedCompany("Bupa Acıbadem Sigorta", "Acıbadem -Bupa")).toBe(false);
    expect(matchesExcludedCompany("Acıbadem Maslak Hastanesi", "Acıbadem -Bupa")).toBe(true);
    expect(matchesExcludedCompany("ACIBADEM Atakent", "Acibadem -Bupa")).toBe(true);
  });
});
