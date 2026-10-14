import { describe, expect, it } from "vitest";
import { canonicalCompanyUrl, companiesFromResult, companyQueryUrls, employeesFromText, expandByCity, parseAboutPairs, parseCompanyCard, sizeFromEmployees } from "./companysearch";
import { TR_PROVINCES } from "./provinces";

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
  it("yeni kart düzeninde konumu okur, aranan il dışını ve psikolog kayıtlarını eler", () => {
    const rows = companiesFromResult({
      viewed: 3,
      queries: [{ label: "özel klinik İstanbul", found: 3 }],
      companies: [
        { name: "Alfa Klinik", linkedinUrl: "https://www.linkedin.com/company/alfa/", text: "Alfa Klinik\n\nHastaneler ve Sağlık\n\nCekmekoy, Istanbul\n\nTakip Et\n\n309 takipçi" },
        { name: "DCT Klinik", linkedinUrl: "https://www.linkedin.com/company/dct/", text: "DCT Klinik\n\nHastaneler ve Sağlık\n\nGüzeloba, Antalya\n\nTakip Et" },
        { name: "Klinik Psikolog Ayşe", linkedinUrl: "https://www.linkedin.com/company/ay/", text: "x\n\nRuh Sağlığı\n\nBakırköy, İstanbul" },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Alfa Klinik", city: "İstanbul", orgType: "Hastaneler ve Sağlık" });
  });
  it("arama bağlantıları Türkiye süzgeciyle ve en çok 6", () => {
    const q = companyQueryUrls(["özel klinik", "Özel Klinik", "tıp merkezi", "a", "b", "c", "d", "e"]);
    expect(q).toHaveLength(6);
    expect(q[0]!.url).toContain("companyHqGeo=");
    expect(q[0]!.url).toContain("102105699");
    expect(q.filter((x) => x.label.toLowerCase() === "özel klinik")).toHaveLength(1);
  });
  it("hakkında çiftlerinden web sitesi ve boyutu okur", () => {
    const d = parseAboutPairs("k1", [{ label: "Web Sitesi", value: "https://alfa.com.tr)" }, { label: "Şirket büyüklüğü", value: "51-200 çalışan" }, { label: "Genel Merkez", value: "İstanbul, İstanbul" }]);
    expect(d).toMatchObject({ id: "k1", website: "https://alfa.com.tr", sizeText: "51-200 çalışan", hq: "İstanbul, İstanbul" });
    expect(parseAboutPairs("k2", [{ label: "?", value: "x" }]).empty).toBe(true);
  });
  it("çalışan metnini sayıya çevirir", () => {
    expect(employeesFromText("201-500 çalışan")).toBe(351);
    expect(employeesFromText("10.001+ çalışan")).toBe(10001);
    expect(employeesFromText(undefined)).toBeUndefined();
  });
  it("anahtar kelimeleri illerle çarpar; 81 il vardır", () => {
    expect(expandByCity(["özel klinik"], ["Ankara", "İzmir"])).toEqual(["özel klinik Ankara", "özel klinik İzmir"]);
    expect(expandByCity(["a"], [])).toEqual(["a"]);
    expect(new Set(TR_PROVINCES).size).toBe(81);
    expect(companyQueryUrls(Array.from({ length: 20 }, (_, i) => `k${i}`), { limit: 100 })).toHaveLength(20);
  });
});
