import { describe, expect, it } from "vitest";
import { MAX_NOTIFY_EMAILS, parseEmailList, renderNotification } from "./notify";

describe("e-posta alıcı listesi", () => {
  it("virgül, noktalı virgül ve satır sonuyla ayırır", () => {
    const r = parseEmailList("Ali@Ornek.com, veli@ornek.com;\nayse@ornek.com");
    expect(r.emails).toEqual(["ali@ornek.com", "veli@ornek.com", "ayse@ornek.com"]);
    expect(r.invalid).toEqual([]);
  });

  it("tekrarları atar ve geçersizleri bildirir", () => {
    const r = parseEmailList("a@ornek.com\na@ornek.com\nbozuk\n@ornek.com");
    expect(r.emails).toEqual(["a@ornek.com"]);
    expect(r.invalid).toEqual(["bozuk", "@ornek.com"]);
  });

  it("alıcı sınırı sabittir", () => {
    expect(MAX_NOTIFY_EMAILS).toBeGreaterThan(0);
    expect(MAX_NOTIFY_EMAILS).toBeLessThanOrEqual(10);
  });
});

describe("e-posta bildirimi metni", () => {
  it("ilgilenen cevabı sıcak fırsat olarak konulandırır", () => {
    const n = renderNotification("interested", { workspace: "Klinik", campaign: "Hastane kampanyası", personName: "Dr. Ayşe Yılmaz", personTitle: "Başhekim", personCompany: "Örnek Hastane", message: "Görüşebiliriz." });
    expect(n.subject).toBe("[Klinik] Sıcak fırsat: Dr. Ayşe Yılmaz");
    expect(n.text).toContain("Kampanya: Hastane kampanyası");
    expect(n.text).toContain("Unvan: Başhekim");
    expect(n.text).toContain("Mesaj: Görüşebiliriz.");
    expect(n.html).toContain("Dr. Ayşe Yılmaz");
  });

  it("kişi verisindeki HTML işaretlerini kaçışlar", () => {
    const n = renderNotification("replied", { personName: "<script>alert('x')</script>", message: "a & b" });
    expect(n.html).not.toContain("<script>");
    expect(n.html).toContain("&lt;script&gt;");
    expect(n.html).toContain("a &amp; b");
  });

  it("çalışan hatasında hesabı ve hata metnini taşır", () => {
    const n = renderNotification("error", { account: "Furkan / Chrome", error: "LinkedIn oturumu kapandı." });
    expect(n.subject).toBe("Çalışan hatası: Furkan / Chrome");
    expect(n.text).toContain("Hata: LinkedIn oturumu kapandı.");
    expect(n.text).toContain("Hesap: Furkan / Chrome");
  });

  it("deneme bildirimi kişi verisi olmadan da üretilir", () => {
    const n = renderNotification("test", { workspace: "Deneme" });
    expect(n.subject).toBe("[Deneme] Deneme bildirimi: e-posta bildirimleri çalışıyor");
    expect(n.text).toContain("e-posta bildirimleri çalışıyor");
  });

  it("boş alanları gövdeye yazmaz", () => {
    const n = renderNotification("accepted", { personName: "Ali Veli", personTitle: "  ", message: "" });
    expect(n.text).not.toContain("Unvan:");
    expect(n.text).not.toContain("Mesaj:");
    expect(n.text).toContain("Ali Veli bağlantı isteğini kabul etti.");
  });
});
