import { describe, expect, it } from "vitest";
import { cleanInstitutionName, institutionKey, kindFromText, looksPublic, parseMohHtml, parseOverpass, parsePaste } from "./institutions";

describe("kurum adı", () => {
  it("ÖZEL önekini atar ve düzgün büyük harf yapar", () => {
    expect(cleanInstitutionName("ÖZEL ACIBADEM ADANA HASTANESİ")).toBe("Acıbadem Adana Hastanesi");
    expect(cleanInstitutionName("Memorial Şişli Hastanesi")).toBe("Memorial Şişli Hastanesi");
  });
  it("aynı kurumu aynı anahtarla bulur", () => {
    expect(institutionKey("ÖZEL LİV HOSPİTAL", "İSTANBUL")).toBe(institutionKey("Liv Hospital", "İstanbul"));
  });
  it("türü ve kamu görünümünü ayırt eder", () => {
    expect(kindFromText("Özel Tıp Merkezi")).toBe("MEDICAL_CENTER");
    expect(kindFromText("Özel Genel Hastane")).toBe("HOSPITAL");
    expect(kindFromText("Bupa Acıbadem Sigorta")).toBe("INSURER");
    expect(looksPublic("Fatih Devlet Hastanesi")).toBe(true);
    expect(looksPublic("Özel Medipol Mega Hastanesi")).toBe(false);
  });
});

describe("kaynak ayrıştırma", () => {
  it("Sağlık Bakanlığı tablosunu okur", () => {
    const html = `<table><tr><th>İl</th><th>İlçe</th><th>Ad/Tanım</th><th>Kuruluş Tipi</th></tr>
      <tr><td>İSTANBUL</td><td>ŞİŞLİ</td><td>ÖZEL MEMORIAL ŞİŞLİ HASTANESİ</td><td>Özel Genel Hastane</td></tr>
      <tr><td>ADANA</td><td>SEYHAN</td><td>ÖZEL ADANA HASTANESİ</td><td>Özel Genel Hastane</td></tr></table>`;
    const r = parseMohHtml(html);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ name: "Memorial Şişli Hastanesi", city: "İstanbul", district: "Şişli", kind: "HOSPITAL", source: "moh" });
  });
  it("Overpass çıktısında kamu ve diş kliniklerini ayıklar", () => {
    const j: { elements: { tags: Record<string, string> }[] } = { elements: [{ tags: { name: "Örnek Hastanesi", amenity: "hospital", beds: "250" } }, { tags: { name: "Fatih Devlet Hastanesi", amenity: "hospital" } }, { tags: { name: "Gül Diş Kliniği", amenity: "dentist" } }, { tags: { name: "Aura Estetik Kliniği", amenity: "clinic" } }] };
    const r = parseOverpass(j, "İstanbul", { dental: false });
    expect(r.map((x) => x.name)).toEqual(["Örnek Hastanesi", "Aura Estetik Kliniği"]);
    expect(r[0]!.size).toBe("LARGE");
  });
  it("yapıştırılan listeyi okur", () => {
    const r = parsePaste("Alfa Tıp Merkezi;Kadıköy\nBeta Kliniği\n\nx", { city: "İstanbul" });
    expect(r.map((x) => x.name)).toEqual(["Alfa Tıp Merkezi", "Beta Kliniği"]);
    expect(r[0]).toMatchObject({ district: "Kadıköy", kind: "MEDICAL_CENTER", city: "İstanbul" });
  });
});
