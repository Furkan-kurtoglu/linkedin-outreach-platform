import { describe, expect, it } from "vitest";
import { canonicalCompanyUrl, companiesFromResult, companyQueryUrls, parseCompanyCard, sizeFromEmployees } from "./companysearch";

describe("LinkedIn şirket kartı", () => {
  it("sektör, il, takipçi ve çalışan sayısını ayıklar", () => {
    const p = parseCompanyCard({ name: "Alfa Tıp Merkezi", linkedinUrl: "https://www.linkedin.com/company/alfa-tip/?trk=x", text: "Alfa Tıp Merkezi\nHastane ve Sağlık Hizmetleri • İstanbul, Türkiye\n12 B takipçi\n51-200 çalışan" });
    expect(p).toMatchObject({ name: "Alfa Tıp Merkezi", linkedinUrl: "https://www.linkedin.com/company/alfa-tip/", industry: "Hastane ve Sağlık Hizmetleri", city: "İstanbul", followers: 12000 });
    expect(p?.employees).toBe(126);
    expect(p?.size).toBe("MEDIUM");
  });
  it("boyut eşikleri", () => {
    expect(sizeFromEmployees(30)).toBe("SMALL");
    expect(sizeFromEmployees(500)).toBe("MEDIUM");
    expect(sizeFromEmployees(501)).toBe("LARGE");
    expect(sizeFromEmployees(undefined)).toBeUndefined();
  });
  it("şirket bağlantısını sadeleştirir", () => {
    expect(canonicalCompanyUrl("https://tr.linkedin.com/company/Beta-Klinik/about/")).toBe("https://www.linkedin.com/company/beta-klinik/");
    expect(canonicalCompanyUrl("https://www.linkedin.com/in/x")).toBeNull();
  });
  it("kamu kurumunu eler, tekrarı birleştirir, türü addan anlar", () => {
    const rows = companiesFromResult({
      viewed: 3,
      queries: [],
      companies: [
        { name: "Beta Diş Kliniği", linkedinUrl: "https://www.linkedin.com/company/beta/", text: "Beta Diş Kliniği\nTıp Uygulamaları • Ankara, Türkiye" },
        { name: "Beta Diş Kliniği", linkedinUrl: "https://www.linkedin.com/company/beta/", text: "Beta Diş Kliniği" },
        { name: "Kadıköy Devlet Hastanesi", linkedinUrl: "https://www.linkedin.com/company/kdh/", text: "x" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "DENTAL", city: "Ankara", source: "linkedin" });
  });
  it("arama bağlantıları Türkiye süzgeciyle ve en çok 6", () => {
    const q = companyQueryUrls(["özel klinik", "Özel Klinik", "tıp merkezi", "a", "b", "c", "d", "e"]);
    expect(q).toHaveLength(6);
    expect(q[0]!.url).toContain("companyHqGeo=");
    expect(q[0]!.url).toContain("102105699");
    expect(q.filter((x) => x.label.toLowerCase() === "özel klinik")).toHaveLength(1);
  });
});
