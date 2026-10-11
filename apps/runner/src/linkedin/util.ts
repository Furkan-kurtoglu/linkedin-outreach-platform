import type { ErrorCode } from "@hfo/core";
import type { Locator, Page } from "playwright";

/** Çalışanın anlaşılır hata türü: panel buna göre hesabı duraklatır ya da kişiyi atlar. */
export class JobError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** İnsan hızında bekleme: [min, max] arası rastgele */
export const pause = (minMs: number, maxMs: number) => sleep(minMs + Math.random() * (maxMs - minMs));

/** Metinlerden herhangi biriyle eşleşen (Türkçe ya da İngilizce arayüz) düzenli ifade */
export const anyText = (...texts: string[]) => new RegExp(`^\\s*(${texts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*$`, "i");
export const containsText = (...texts: string[]) => new RegExp(`(${texts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "i");

/** Sayfa LinkedIn'in oturum ya da doğrulama ekranına düştü mü? */
export async function guard(page: Page): Promise<void> {
  const url = page.url();
  if (/\/(login|uas\/login|authwall|signup)/.test(url)) throw new JobError("session_expired", "LinkedIn oturumu kapandı.");
  if (/\/checkpoint\//.test(url)) throw new JobError("linkedin_warning", "LinkedIn doğrulama istedi (checkpoint). Tarayıcı penceresinde kontrol edin.");
  const restricted = await page
    .getByText(containsText("account has been restricted", "hesabınız kısıtlandı", "unusual activity", "olağandışı etkinlik"))
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (restricted) throw new JobError("linkedin_warning", "LinkedIn hesapta olağandışı etkinlik uyarısı gösterdi.");
}

/** Sayfaya git, yüklenmesini bekle, oturum/uyarı denetimi yap, biraz kaydır (okuyormuş gibi). */
export async function open(page: Page, url: string): Promise<void> {
  const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await pause(1500, 3500);
  await guard(page);
  if (res && res.status() === 404) throw new JobError("not_found", "Sayfa bulunamadı.");
  const unavailable = await page
    .getByText(containsText("This page doesn’t exist", "This page doesn't exist", "Bu sayfa mevcut değil", "profile is not available", "profil kullanılamıyor"))
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
  if (unavailable) throw new JobError("not_found", "Profil bulunamadı ya da kaldırılmış.");
  await page.mouse.wheel(0, 200 + Math.random() * 400).catch(() => undefined);
  await pause(600, 1500);
}

/** Görünür ilk öğe; yoksa null */
export async function firstVisible(...locs: Locator[]): Promise<Locator | null> {
  for (const l of locs) {
    const n = await l.count().catch(() => 0);
    for (let i = 0; i < Math.min(n, 6); i++) {
      const el = l.nth(i);
      if (await el.isVisible().catch(() => false)) return el;
    }
  }
  return null;
}

/** Tıkla ve kısa bekle */
export async function click(l: Locator) {
  await l.scrollIntoViewIfNeeded().catch(() => undefined);
  await pause(300, 900);
  await l.click({ timeout: 10_000 });
  await pause(800, 1800);
}

/**
 * Metni insan gibi yazar: satır sonlarında Shift+Enter (LinkedIn'de Enter mesajı gönderebilir).
 * Uzun metinlerde harf harf yazmak dakikalar sürer; satırlar parça parça eklenir.
 */
export async function typeText(page: Page, box: Locator, text: string) {
  await box.click();
  await pause(300, 700);
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line) {
      // İlk birkaç karakter tek tek, kalanı tek seferde
      const head = line.slice(0, 8);
      for (const ch of head) await page.keyboard.type(ch, { delay: 40 + Math.random() * 80 });
      if (line.length > 8) await page.keyboard.insertText(line.slice(8));
    }
    if (i < lines.length - 1) {
      await page.keyboard.down("Shift");
      await page.keyboard.press("Enter");
      await page.keyboard.up("Shift");
    }
    await pause(80, 250);
  }
}

/** "3 gün önce", "2 weeks ago", "dün" gibi göreli zamanı yaklaşık tarihe çevirir. */
export function relativeToDate(text: string, now = new Date()): Date {
  const t = text.toLocaleLowerCase("tr-TR");
  const n = Number(t.match(/(\d+)/)?.[1] ?? 1);
  const DAY = 86_400_000;
  if (/(dakika|minute|saat|hour|bugün|today|şimdi|now)/.test(t)) return now;
  if (/(dün|yesterday)/.test(t)) return new Date(now.getTime() - DAY);
  if (/(gün|day)/.test(t)) return new Date(now.getTime() - n * DAY);
  if (/(hafta|week)/.test(t)) return new Date(now.getTime() - n * 7 * DAY);
  if (/(ay|month)/.test(t)) return new Date(now.getTime() - n * 30 * DAY);
  return now;
}
