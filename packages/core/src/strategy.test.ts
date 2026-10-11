import { describe, expect, it } from "vitest";
import { findSector, parseStrategyFunctions, strategyFor } from "./strategy";

describe("sektör stratejisi", () => {
  it("bilinen sektörü addan ya da eş anlamlıdan bulur", () => {
    expect(findSector("Gıda")?.id).toBe("gida");
    expect(findSector("otomotiv yan sanayi")?.id).toBe("otomotiv");
    expect(findSector("hospital")?.id).toBe("saglik");
    expect(findSector("uzay madenciliği")).toBeNull();
  });
  it("boyuta göre unvan ağırlığı değişir", () => {
    const k = strategyFor({ sector: "gıda", size: "kucuk", functions: ["finans"] });
    expect(k.titles).toContain("Kurucu");
    expect(k.titles).not.toContain("Finance Manager");
    const o = strategyFor({ sector: "gıda", size: "orta", functions: ["finans"] });
    expect(o.titles).toContain("Finance Manager");
    expect(o.titles).not.toContain("CFO");
    const b = strategyFor({ sector: "gıda", size: "buyuk", functions: ["finans"] });
    expect(b.titles).toContain("CFO");
    expect(b.titles).toContain("Kalite Müdürü");
  });
  it("bilinmeyen sektörde sözcükten arama türetir ve not düşer", () => {
    const p = strategyFor({ sector: "uzay madenciliği" });
    expect(p.known).toBe(false);
    expect(p.companyKeywords[0]).toBe("uzay madenciliği");
    expect(p.notes.length).toBeGreaterThan(0);
  });
  it("tekrar etmez ve her sektörde stajyeri eler", () => {
    const p = strategyFor({ sector: "otomotiv", size: "hepsi", functions: ["genel", "satis"] });
    expect(new Set(p.titles.map((t) => t.toLowerCase())).size).toBe(p.titles.length);
    expect(p.excludedTitles).toContain("Stajyer");
  });
  it("işlev listesini ayrıştırır", () => {
    expect(parseStrategyFunctions("finans,teknoloji,yok")).toEqual(["finans", "teknoloji"]);
    expect(parseStrategyFunctions(undefined)).toEqual([]);
  });
});
