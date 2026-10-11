import { describe, expect, it } from "vitest";
import { splitHeadline } from "./index";

describe("başlık ayırma", () => {
  it("İngilizce, Türkçe ve ayraçlı başlıklar", () => {
    expect(splitHeadline("Hospital Manager at Özel Örnek Hastanesi")).toEqual({ title: "Hospital Manager", company: "Özel Örnek Hastanesi" });
    expect(splitHeadline("Özel Örnek Hastanesi'nde Hasta Hizmetleri Müdürü")).toEqual({ company: "Özel Örnek Hastanesi", title: "Hasta Hizmetleri Müdürü" });
    expect(splitHeadline("Örnek Sigorta'da Genel Müdür Yardımcısı")).toEqual({ company: "Örnek Sigorta", title: "Genel Müdür Yardımcısı" });
    expect(splitHeadline("Genel Müdür | Örnek Tıp Merkezi")).toEqual({ title: "Genel Müdür", company: "Örnek Tıp Merkezi" });
    expect(splitHeadline("Başhekim")).toEqual({ title: "Başhekim" });
    expect(splitHeadline(undefined)).toEqual({});
  });
});
