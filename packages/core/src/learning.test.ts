import { describe, expect, it } from "vitest";
import { featuresOf, learn, learnedBoost, pooledOutcomes, titleGroupOf } from "./learning";

describe("ortak öğrenme", () => {
  it("unvan grubu ilk iki sözcüktür ve Türkçe küçültülür", () => {
    expect(titleGroupOf("Genel Müdür Yardımcısı")).toBe("genel müdür");
    expect(titleGroupOf("IT Manager, Digital")).toBe("it manager");
    expect(titleGroupOf("")).toBeUndefined();
    expect(titleGroupOf(null)).toBeUndefined();
  });
  it("kendi sonuçları iki kat sayılır", () => {
    const own = [{ features: ["a"], success: true }];
    const others = [{ features: ["a"], success: false }];
    expect(pooledOutcomes(own, others)).toHaveLength(3);
  });
  it("30 sonuçtan azsa katkı vermez, yeterliyse sınırlı katkı verir", () => {
    const few = learn(Array.from({ length: 10 }, () => ({ features: ["unvan:x"], success: true })));
    expect(learnedBoost(few, ["unvan:x"])).toBe(0);
    const outs = [
      ...Array.from({ length: 20 }, () => ({ features: featuresOf({ titleGroup: "genel müdür" }), success: true })),
      ...Array.from({ length: 20 }, () => ({ features: featuresOf({ titleGroup: "stajyer x" }), success: false })),
    ];
    const m = learn(outs);
    expect(learnedBoost(m, ["unvan:genel müdür"])).toBeGreaterThan(0);
    expect(learnedBoost(m, ["unvan:stajyer x"])).toBeLessThan(0);
    expect(Math.abs(learnedBoost(m, ["unvan:genel müdür"]))).toBeLessThanOrEqual(15);
  });
});
