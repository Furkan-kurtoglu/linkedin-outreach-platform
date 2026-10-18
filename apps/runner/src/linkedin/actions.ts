/**
 * LinkedIn işlemleri. LinkedIn arayüzü zaman zaman değişir; seçiciler önce erişilebilirlik
 * etiketlerine ve görünen metne (Türkçe ve İngilizce) dayanır, sınıf adlarına en son başvurulur.
 * Bir işlem beklenmedik bir ekranla karşılaşırsa ekran görüntüsü ~/.hfo-runner/kayitlar altına
 * kaydedilir ve iş "geçici hata" olarak bildirilir; hiçbir şey tahminle gönderilmez.
 */
import {
  canonicalProfileUrl,
  parseAboutPairs,
  type ConnectionsData,
  type CompanyDiscoverData,
  type CompanyDetail,
  type CompanyQueryPayload,
  type EnrichCompaniesData,
  type DiscoverCandidate,
  type DiscoverData,
  type DiscoverStepPayload,
  type InboxData,
  type InboxThread,
  type InviteData,
  type SentInvitesData,
  type VisitData,
} from "@hfo/core";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Locator, Page } from "playwright";
import { LOG_DIR } from "../config";
import { anyText, click, containsText, firstVisible, guard, JobError, open, pause, relativeToDate, typeText } from "./util";

/* ---------- Kendi profilim ---------- */

export interface SelfInfo {
  fullName?: string;
  profileUrl?: string;
  premium?: boolean;
  schools: string[];
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => undefined);
  await pause(1500, 2500);
  const url = page.url();
  return url.includes("linkedin.com/feed") && !/(login|authwall|checkpoint)/.test(url);
}

/** Profil adı: önce h1; LinkedIn'in yeni arayüzünde h1 yoksa sayfa başlığından ("Ad Soyad | LinkedIn") */
async function profileName(page: Page, timeout: number): Promise<string | undefined> {
  const h1 = (await page.locator("main h1, h1").first().innerText({ timeout }).catch(() => ""))?.trim();
  if (h1) return h1;
  const title = (await page.title().catch(() => "")).replace(/^\(\d+\)\s*/, "");
  const name = title.split(/\s+[|\-–]\s+/)[0]?.trim();
  return name && !/^linkedin$/i.test(name) ? name : undefined;
}

export async function readSelf(page: Page): Promise<SelfInfo> {
  await open(page, "https://www.linkedin.com/in/me/");
  const profileUrl = canonicalProfileUrl(page.url()) ?? undefined;
  const fullName = await profileName(page, 10_000);
  const premium = await page
    .locator("main")
    .getByText(containsText("Premium"))
    .first()
    .isVisible({ timeout: 1500 })
    .catch(() => false);
  const schools = await readEducation(page);
  return { fullName, profileUrl, premium, schools };
}

/** Profil sayfasındaki eğitim bölümünden okul adları */
async function readEducation(page: Page): Promise<string[]> {
  const section = page.locator("section:has(#education)");
  if (!(await section.count().catch(() => 0))) return [];
  const names = await section
    .locator("li a[href*='/company/'] span[aria-hidden='true'], li a[href*='/school/'] span[aria-hidden='true'], li div.t-bold span[aria-hidden='true']")
    .allInnerTexts()
    .catch(() => [] as string[]);
  return [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 2))].slice(0, 8);
}

/* ---------- Profil ziyareti ---------- */

const DEGREE_RE = /(?:^|\s|·|•)(1|2|3)(?:\.|st|nd|rd|th)(?:\s|$)/;

export async function visitProfile(page: Page, url: string, opts: { readPost?: boolean; readEducation?: boolean; mySchools: string[] }): Promise<VisitData> {
  await open(page, url);
  const top = page.locator("main section").first();
  const fullName = await profileName(page, 15_000);
  if (!fullName) throw new JobError("transient", "Profil sayfası okunamadı.");
  const topText = (await top.innerText().catch(() => "")) ?? "";
  const lines = topText.split("\n").map((l) => l.trim()).filter(Boolean);
  const nameIdx = lines.findIndex((l) => l === fullName);
  const after = nameIdx >= 0 ? lines.slice(nameIdx + 1) : lines;
  const degreeLine = after.find((l) => DEGREE_RE.test(` ${l} `) && l.length < 20);
  const degree = degreeLine ? (Number(DEGREE_RE.exec(` ${degreeLine} `)![1]) as 1 | 2 | 3) : undefined;
  const headline = after.find((l) => l.length > 3 && !DEGREE_RE.test(` ${l} `) && !/^(she|he|they|o)\s*\//i.test(l) && l !== "·");
  const location = after.find((l, i) => i > 0 && /,/.test(l) && l.length < 80 && l !== headline && !/bağlantı|connection|takipçi|follower/i.test(l));
  const company = await top
    .locator("button[aria-label*='Current company'], button[aria-label*='Şu anki şirket'], button[aria-label*='Mevcut şirket']")
    .first()
    .getAttribute("aria-label", { timeout: 1500 })
    .then((a) => a?.replace(/^.*?:\s*/, "").replace(/\.\s*Click.*$/i, "").trim() || undefined)
    .catch(() => undefined);

  // Ortak bağlantılar: "Ahmet Yılmaz, Mehmet Kaya ve 3 diğer ortak bağlantı" / "Ahmet Yılmaz and 2 other mutual connections"
  const mutualText = lines.find((l) => /ortak bağlantı|mutual connection/i.test(l));
  let mutualName: string | undefined;
  let mutualConnections: number | undefined;
  if (mutualText) {
    mutualName = mutualText.split(/,| ve | and /)[0]?.trim();
    if (mutualName && (/\d/.test(mutualName) || /ortak|mutual/i.test(mutualName))) mutualName = undefined;
    const more = Number(mutualText.match(/(\d+)\s*(diğer|other)/i)?.[1] ?? 0);
    const named = mutualText.split(/,| ve | and /).filter((x) => !/\d|ortak|mutual/i.test(x)).length;
    mutualConnections = named + more || undefined;
  }
  const invitePending = !!(await firstVisible(top.getByRole("button", { name: containsText("Pending", "Beklemede") })));
  const openProfile = /open profile|açık profil/i.test(topText) || undefined;

  const about = await page
    .locator("section:has(#about) span[aria-hidden='true']")
    .first()
    .innerText({ timeout: 1500 })
    .then((t) => t.slice(0, 600))
    .catch(() => undefined);

  // Deneyim bölümü: üstteki kartta kurum yoksa son çalışılan kurumlardan tamamlanır
  const experience = company ? undefined : await readExperience(page);

  let sharedSchool: string | undefined;
  if (opts.readEducation && opts.mySchools.length) {
    const theirs = await readEducation(page);
    const fold = (s: string) => s.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
    sharedSchool = theirs.find((t) => opts.mySchools.some((m) => fold(m) === fold(t)));
  }

  let recentPostText: string | undefined;
  if (opts.readPost && degree !== undefined) {
    // Son paylaşım: yalnızca konusu panelde çıkarılır, metin saklanmaz
    const base = (canonicalProfileUrl(url) ?? url).replace(/\/$/, "");
    await open(page, `${base}/recent-activity/all/`);
    const post = await page
      .locator("div.feed-shared-update-v2 .update-components-text, div.feed-shared-update-v2 span.break-words")
      .first()
      .innerText({ timeout: 4000 })
      .catch(() => undefined);
    const when = await page.locator("div.feed-shared-update-v2 .update-components-actor__sub-description").first().innerText({ timeout: 1500 }).catch(() => "");
    // Son 30 gün içindeki paylaşım
    if (post && relativeToDate(when).getTime() > Date.now() - 30 * 86_400_000) recentPostText = post.slice(0, 1000);
  }

  return { fullName, headline, location, company, experience, degree, mutualName, mutualConnections, invitePending, openProfile, about, sharedSchool, recentPostText };
}


/** Deneyim bölümündeki kurum adları (şu an çalıştıkları önce, ardından en yeniden eskiye). */
async function readExperience(page: Page): Promise<string[] | undefined> {
  const DURATION = /^\d+\s*(yıl|yil|yr|ay|mo|mos|yrs)/i;
  const items = page.locator("section:has(#experience) li.artdeco-list__item");
  const count = Math.min(await items.count().catch(() => 0), 6);
  const current: string[] = [];
  const past: string[] = [];
  for (let i = 0; i < count; i++) {
    const spans = await items.nth(i).locator("span[aria-hidden='true']").allInnerTexts().catch(() => [] as string[]);
    const t = spans.map((x) => x.trim()).filter(Boolean);
    if (t.length < 2) continue;
    // Aynı kurumda birden çok pozisyon: ilk satır kurum, ikinci satır süre
    const company = (DURATION.test(t[1]) && !t[1].includes("·") ? t[0] : t[1].split("·")[0]).trim();
    if (!company || company.length > 80) continue;
    const isCurrent = t.some((x) => /(Present|Günümüz|Devam ediyor|Halen)/i.test(x));
    (isCurrent ? current : past).push(company);
  }
  const all = [...new Set([...current, ...past])];
  return all.length ? all.slice(0, 4) : undefined;
}

/* ---------- Davet ---------- */

async function topCard(page: Page): Promise<Locator> {
  return page.locator("main section").first();
}

export async function sendInvite(page: Page, url: string, note?: string): Promise<InviteData> {
  await open(page, url);
  const card = await topCard(page);
  if (await firstVisible(card.getByRole("button", { name: containsText("Pending", "Beklemede") }))) return { status: "already_pending" };

  let connect = await firstVisible(
    card.getByRole("button", { name: containsText("Invite", "davet et", "bağlantı kurmak için davet") }),
    card.getByRole("button", { name: anyText("Connect", "Bağlantı kur") }),
  );
  if (!connect) {
    const more = await firstVisible(card.getByRole("button", { name: containsText("More actions", "More", "Diğer işlemler", "Diğer") }));
    if (more) {
      await click(more);
      connect = await firstVisible(
        page.getByRole("button", { name: containsText("Invite", "davet et") }),
        page.locator("div[role='button'][aria-label*='Invite'], div[role='button'][aria-label*='davet']"),
        page.getByRole("menuitem", { name: containsText("Connect", "Bağlantı kur") }),
      );
    }
  }
  if (!connect) {
    const isConnection = !!(await firstVisible(card.getByRole("button", { name: containsText("Remove connection", "Bağlantıyı kaldır") })));
    const firstDegree = /(?:^|\s)1(?:\.|st)(?:\s|$)/.test(` ${(await card.innerText().catch(() => "")) ?? ""} `);
    if (isConnection || firstDegree) return { status: "already_connected" };
    throw new JobError("cannot_message", "Bu profilde davet düğmesi yok (yalnızca takip edilebiliyor olabilir).");
  }
  await click(connect);

  const dialog = page.getByRole("dialog").last();
  await dialog.waitFor({ state: "visible", timeout: 10_000 }).catch(() => undefined);
  await checkInviteLimits(page);
  if (await dialog.getByText(containsText("email address", "e-posta adres")).first().isVisible({ timeout: 800 }).catch(() => false)) {
    await page.keyboard.press("Escape");
    throw new JobError("cannot_message", "LinkedIn bu kişiye davet için e-posta adresi istiyor.");
  }

  if (note) {
    const addNote = await firstVisible(dialog.getByRole("button", { name: containsText("Add a note", "Not ekle") }));
    if (addNote) await click(addNote);
    const box = await firstVisible(dialog.locator("textarea[name='message']"), dialog.locator("textarea"));
    if (!box) {
      await page.keyboard.press("Escape");
      // Not ekleme hakkı dolmuş olabilir (ücretsiz hesaplarda aylık sınır): notsuz göndermek yerine dur;
      // kişi atlanmaz, iş daha sonra yeniden denenir
      throw new JobError("transient", "Davet notu eklenemedi (aylık not sınırı dolmuş olabilir).");
    }
    await typeText(page, box, note);
    await pause(800, 1600);
    const send = await firstVisible(dialog.getByRole("button", { name: anyText("Send", "Gönder", "Send invitation", "Davet gönder") }));
    if (!send || (await send.isDisabled())) throw new JobError("transient", "Gönder düğmesi bulunamadı.");
    await click(send);
  } else {
    const send = await firstVisible(
      dialog.getByRole("button", { name: containsText("Send without a note", "Not olmadan gönder", "Notsuz gönder") }),
      dialog.getByRole("button", { name: anyText("Send", "Gönder") }),
    );
    if (!send) throw new JobError("transient", "Gönder düğmesi bulunamadı.");
    await click(send);
  }
  await pause(1500, 2500);
  await checkInviteLimits(page);
  const pending = await firstVisible((await topCard(page)).getByRole("button", { name: containsText("Pending", "Beklemede") }));
  if (!pending) {
    // Bazı sürümlerde düğme hemen değişmez; sayfayı yenileyip tekrar bakılır
    await page.reload({ waitUntil: "domcontentloaded" });
    await pause(2000, 3000);
    if (!(await firstVisible((await topCard(page)).getByRole("button", { name: containsText("Pending", "Beklemede") }))))
      throw new JobError("transient", "Davetin gittiği doğrulanamadı.");
  }
  return { status: "sent" };
}

async function checkInviteLimits(page: Page) {
  const limit = await page
    .getByText(containsText("weekly invitation limit", "haftalık davet sınırı", "reached the weekly", "too many pending invitations", "çok fazla bekleyen davet"))
    .first()
    .isVisible({ timeout: 800 })
    .catch(() => false);
  if (limit) {
    await page.keyboard.press("Escape").catch(() => undefined);
    throw new JobError("invite_limit", "LinkedIn haftalık davet sınırına ulaşıldığını bildirdi.");
  }
}

/* ---------- Mesaj ---------- */

async function downloadAttachment(fetchUrl: () => Promise<{ url: string; name: string }>): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const { url, name } = await fetchUrl();
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new JobError("transient", "Belge indirilemedi.");
  const dir = await mkdtemp(join(tmpdir(), "hfo-"));
  const path = join(dir, name.replace(/[\\/:*?"<>|]+/g, "-") || "belge.pdf");
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return { path, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/**
 * Profil sayfasındaki "Mesaj" düğmesiyle yazışma penceresini açar ve metni gönderir.
 * Bağlantı olmayan açık profillerde ve InMail'de konu alanı da doldurulur.
 */
export async function sendMessage(
  page: Page,
  url: string,
  text: string,
  opts: { subject?: string; attachment?: () => Promise<{ url: string; name: string }>; requireConnection?: boolean },
): Promise<{ creditsLeft?: number }> {
  await open(page, url);
  const card = await topCard(page);
  const msgBtn = await firstVisible(card.getByRole("button", { name: containsText("Message", "Mesaj") }), card.getByRole("link", { name: containsText("Message", "Mesaj") }));
  if (!msgBtn) throw new JobError("cannot_message", "Bu kişiye mesaj gönderilemiyor (Mesaj düğmesi yok).");
  await closeOpenConversations(page);
  await click(msgBtn);

  const form = page.locator("form.msg-form, div.msg-form, .msg-overlay-conversation-bubble form").last();
  const box = await (async () => {
    for (let i = 0; i < 10; i++) {
      const b = await firstVisible(page.locator("div.msg-form__contenteditable[contenteditable='true']"), page.locator("div[role='textbox'][contenteditable='true']"));
      if (b) return b;
      await pause(700, 900);
    }
    return null;
  })();
  if (!box) {
    if (await page.getByText(containsText("Premium", "InMail")).first().isVisible({ timeout: 800 }).catch(() => false))
      throw new JobError("cannot_message", "Bu kişiye yalnızca InMail ile yazılabiliyor.");
    throw new JobError("transient", "Mesaj kutusu açılmadı.");
  }

  let creditsLeft: number | undefined;
  const subject = await firstVisible(page.locator("input[name='subject']"), page.getByPlaceholder(containsText("Subject", "Konu")));
  if (subject) {
    if (opts.requireConnection) throw new JobError("cannot_message", "Kişi bağlantı değil; mesaj yerine InMail gerekir.");
    const creditText = await page.getByText(/(\d+)\s*(InMail credits|InMail kredi)/i).first().innerText({ timeout: 800 }).catch(() => "");
    const m = creditText.match(/(\d+)/);
    if (m) creditsLeft = Math.max(0, Number(m[1]) - 1);
    await typeText(page, subject, opts.subject ?? "Kısa bir tanışma");
  }

  // Aynı metin bu konuşmada zaten varsa (ör. önceki deneme yarıda kaldıysa) tekrar gönderilmez
  const head = text.slice(0, 60).trim();
  const already = await page
    .locator(".msg-s-event-listitem__body, .msg-s-message-list__event")
    .filter({ hasText: head })
    .count()
    .catch(() => 0);
  if (already > 0) return { creditsLeft };

  await typeText(page, box, text);

  let cleanup: (() => Promise<void>) | undefined;
  if (opts.attachment) {
    const file = await downloadAttachment(opts.attachment);
    cleanup = file.cleanup;
    const input = page.locator("input[type='file']").last();
    await input.setInputFiles(file.path);
    // Yükleme bitene kadar bekle
    for (let i = 0; i < 30; i++) {
      const uploading = await page.locator(".msg-attachment-preview__progress, [role='progressbar']").count().catch(() => 0);
      if (!uploading) break;
      await pause(900, 1100);
    }
    await pause(1000, 2000);
  }

  const send = await firstVisible(page.locator("button.msg-form__send-button"), form.getByRole("button", { name: anyText("Send", "Gönder") }));
  try {
    if (!send) throw new JobError("transient", "Gönder düğmesi bulunamadı.");
    if (await send.isDisabled()) throw new JobError("transient", "Gönder düğmesi pasif.");
    await click(send);
    // Gönderildiğini doğrula: metin konuşmada görünmeli
    let ok = false;
    for (let i = 0; i < 12 && !ok; i++) {
      await pause(800, 1000);
      ok = (await page.locator(".msg-s-event-listitem__body, .msg-s-message-list__event").filter({ hasText: head }).count().catch(() => 0)) > 0;
    }
    await guard(page);
    if (!ok) throw new JobError("transient", "Mesajın gittiği doğrulanamadı.");
  } finally {
    await cleanup?.();
    await closeOpenConversations(page);
  }
  return { creditsLeft };
}

async function closeOpenConversations(page: Page) {
  const closers = page.locator("button[data-control-name='overlay.close_conversation_window'], .msg-overlay-bubble-header__controls button:has(svg[data-test-icon='close-small'])");
  const n = await closers.count().catch(() => 0);
  for (let i = n - 1; i >= 0; i--) await closers.nth(i).click({ timeout: 3000 }).catch(() => undefined);
}

/* ---------- Daveti geri çekme ---------- */

export async function withdrawInvite(page: Page, url: string): Promise<void> {
  await open(page, url);
  const card = await topCard(page);
  const pending = await firstVisible(card.getByRole("button", { name: containsText("Pending", "Beklemede", "Withdraw", "Geri çek") }));
  if (!pending) return; // kabul edilmiş ya da zaten geri çekilmiş
  await click(pending);
  const confirm = await firstVisible(page.getByRole("dialog").last().getByRole("button", { name: anyText("Withdraw", "Geri çek") }));
  if (!confirm) throw new JobError("transient", "Geri çekme onayı bulunamadı.");
  await click(confirm);
}

/* ---------- Kabul edilen davetler ---------- */

export async function recentConnections(page: Page, limit: number): Promise<ConnectionsData> {
  await open(page, "https://www.linkedin.com/mynetwork/invite-connect/connections/");
  const hrefs = await page.locator("main a[href*='/in/']").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).href));
  const urls = [...new Set(hrefs.map((h) => canonicalProfileUrl(h)).filter((u): u is string => !!u))];
  return { profileUrls: urls.slice(0, limit) };
}

/* ---------- Gönderilen davetler ---------- */

export async function sentInvites(page: Page): Promise<SentInvitesData> {
  await open(page, "https://www.linkedin.com/mynetwork/invitation-manager/sent/");
  const items = await page.locator("main li").evaluateAll((lis) =>
    lis
      .map((li) => {
        const a = li.querySelector("a[href*='/in/']") as HTMLAnchorElement | null;
        return a ? { href: a.href, text: (li as HTMLElement).innerText } : null;
      })
      .filter((x): x is { href: string; text: string } => !!x),
  );
  const now = new Date();
  const invites = items
    .map((i) => {
      const url = canonicalProfileUrl(i.href);
      const when = i.text.split("\n").find((l) => /(önce|ago|gönderildi|sent)/i.test(l)) ?? "";
      return url ? { profileUrl: url, sentAt: relativeToDate(when, now).toISOString() } : null;
    })
    .filter((x): x is { profileUrl: string; sentAt: string } => !!x);
  return { invites };
}

/* ---------- Gelen kutusu ---------- */

/**
 * Son konuşmaları okur. Önceki kontrolden beri değişmeyen konuşmalar açılmaz (önbellek),
 * böylece her kontrolde yalnızca yeni mesajı olanlar okunur.
 */
export async function readInbox(page: Page, limit: number, myName: string | undefined, seen: Map<string, string>): Promise<InboxData> {
  await open(page, "https://www.linkedin.com/messaging/");
  const items = page.locator("li.msg-conversation-listitem, li.msg-conversations-container__convo-item");
  const n = Math.min(limit, await items.count().catch(() => 0));
  const threads: InboxThread[] = [];
  for (let i = 0; i < n; i++) {
    const item = items.nth(i);
    const summary = ((await item.innerText().catch(() => "")) ?? "").replace(/\s+/g, " ").trim();
    const key = summary.slice(0, 80);
    const sig = summary;
    if (seen.get(key) === sig) continue;
    await item.locator("a, div[role='button']").first().click({ timeout: 5000 }).catch(() => item.click());
    await pause(1500, 2500);
    await guard(page);
    const profileHref = await page
      .locator(".msg-thread a[href*='/in/'], .msg-entity-lockup a[href*='/in/'], .msg-title-bar a[href*='/in/']")
      .first()
      .getAttribute("href", { timeout: 3000 })
      .catch(() => null);
    const profileUrl = profileHref ? canonicalProfileUrl(new URL(profileHref, "https://www.linkedin.com").href) : null;
    if (!profileUrl) {
      seen.set(key, sig);
      continue;
    }
    const events = await page.locator("li.msg-s-message-list__event").evaluateAll((lis) => {
      let sender = "";
      return lis.map((li) => {
        const name = (li.querySelector(".msg-s-message-group__name, .msg-s-message-group__profile-link") as HTMLElement | null)?.innerText?.trim();
        if (name) sender = name;
        const time = (li.querySelector("time") as HTMLElement | null)?.getAttribute("datetime") ?? "";
        const body = (li.querySelector(".msg-s-event-listitem__body") as HTMLElement | null)?.innerText?.trim() ?? "";
        return { sender, body, time };
      });
    });
    const myFirst = (myName ?? "").split(" ")[0]?.toLocaleLowerCase("tr-TR");
    threads.push({
      profileUrl,
      messages: events
        .filter((e) => e.body)
        .slice(-15)
        .map((e) => ({
          fromMe: !!myFirst && e.sender.toLocaleLowerCase("tr-TR").startsWith(myFirst),
          text: e.body,
          at: e.time || new Date().toISOString(),
        })),
    });
    seen.set(key, sig);
    await pause(800, 1600);
  }
  return { threads };
}

/* ---------- Kişi bulma ---------- */


const GENERIC = new Set(["ozel", "hastanesi", "hastane", "hospital", "klinigi", "klinik", "clinic", "medical", "center", "merkezi", "merkez", "tip", "saglik", "as", "a", "s", "ltd", "sti", "sirketi", "ve", "ticaret", "sanayi", "grubu", "group", "sigorta", "hayat", "emeklilik"]);
const norm = (x: string) => x.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** "Hedef kurum · X" adımında sonuç, kurum adının ayırt edici sözcüklerini kartta taşımıyorsa başka şirketin kişisidir. */
function mentionsCompany(text: string, label: string): boolean {
  const name = label.split("·").slice(1).join("·");
  const core = norm(name).split(" ").filter((w) => w.length > 1 && !GENERIC.has(w));
  if (!core.length) return true;
  const hay = ` ${norm(text)} `;
  return core.every((w) => hay.includes(` ${w}`));
}

/**
 * Kişi arama sonuçlarını okur. LinkedIn düzeni sık değiştiği için sonuç kartları `li` yerine
 * `role=listitem` / `li` kapsayıcılarındaki ilk profil bağlantısından alınır; aynı kişi için en küçük kart seçilir.
 */
async function readPeople(page: Page): Promise<{ href: string; name: string; text: string }[] | null> {
  return retryNav(page, () =>
    page.evaluate(() => {
      const root = document.querySelector("main") ?? document.body;
      const best = new Map<string, { href: string; name: string; text: string }>();
      for (const el of Array.from(root.querySelectorAll("[role='listitem'], li")) as HTMLElement[]) {
        const links = Array.from(el.querySelectorAll("a[href*='/in/']")) as HTMLAnchorElement[];
        const a = links.find((x) => (x.innerText ?? "").trim());
        if (!a) continue;
        const path = new URL(a.href).pathname.split("/").slice(0, 3).join("/");
        const text = el.innerText ?? "";
        // Birden çok kişiyi kapsayan dış kapsayıcılar elenir
        const others = new Set(links.map((x) => new URL(x.href).pathname.split("/").slice(0, 3).join("/")));
        if (others.size > 6) continue;
        // Kart başlığı "Ad Soyad • 2." gibi gelebilir: derece eki addan ayrılır
        const name = ((a.innerText ?? "").split("\n").map((x) => x.trim()).find(Boolean) ?? "").replace(/\s*[•·]\s*(?:1|2|3)(?:\.|st|nd|rd|\+)?.*$/, "").trim();
        if (!name) continue;
        const cur = best.get(path);
        if (!cur || text.length < cur.text.length) best.set(path, { href: a.href, name, text });
      }
      return Array.from(best.values());
    }),
  ).catch(() => null);
}

export async function discover(page: Page, steps: DiscoverStepPayload[], viewBudget: number): Promise<DiscoverData> {
  const candidates: DiscoverCandidate[] = [];
  const report: DiscoverData["steps"] = [];
  let viewed = 0;
  for (const step of steps) {
    if (viewed >= viewBudget) break;
    let stepViewed = 0;
    let stepFound = 0;
    let pageBase = step.url;
    for (let p = 1; p <= step.maxPages && viewed < viewBudget; p++) {
      const url = p === 1 ? pageBase : `${pageBase}&page=${p}`;
      await open(page, url);
      await page.mouse.wheel(0, 1500).catch(() => undefined);
      await pause(1200, 2200);
      let rows = await readPeople(page);
      // Kurum adımında unvan + kurum birlikte sonuç vermezse yalnızca kurum adıyla aranır (unvanı panel puanlar)
      if (!rows?.length && p === 1 && step.source === "accounts") {
        const kw = new URL(step.url).searchParams.get("keywords") ?? "";
        const name = /AND ("[^"]+")\s*$/.exec(kw)?.[1];
        if (name) {
          await dumpDebug(page, "kisi-arama-bos");
          const alt = new URL(step.url);
          alt.searchParams.set("keywords", name);
          await open(page, alt.toString());
          await page.mouse.wheel(0, 1500).catch(() => undefined);
          await pause(1200, 2200);
          rows = await readPeople(page);
          if (rows?.length) pageBase = alt.toString();
        }
      }
      if (!rows?.length && p === 1) await dumpDebug(page, "kisi-arama-bos");
      if (!rows?.length) break;
      viewed += rows.length;
      stepViewed += rows.length;
      for (const r of rows) {
        if (step.source === "accounts" && !mentionsCompany(r.text, step.label)) continue;
        const url = canonicalProfileUrl(r.href);
        if (!url || /linkedin member|linkedin üyesi/i.test(r.name)) continue;
        const lines = r.text.split("\n").map((l) => l.trim()).filter((l) => l && l !== r.name && !/^(view|profili görüntüle)/i.test(l) && l !== "•");
        const degLine = lines.find((l) => DEGREE_RE.test(` ${l} `) && l.length < 25);
        const degree = degLine ? (Number(DEGREE_RE.exec(` ${degLine} `)![1]) as 1 | 2 | 3) : step.source === "connections" ? 1 : undefined;
        const rest = lines.filter((l) => l !== degLine && !/^(connect|bağlantı kur|message|mesaj|follow|takip et|pending|beklemede)$/i.test(l));
        const mutualLine = rest.find((l) => /ortak bağlantı|mutual connection/i.test(l));
        const content = rest.filter((l) => l !== mutualLine && !/^(current|şu an|past|geçmiş):/i.test(l));
        candidates.push({
          profileUrl: url,
          fullName: r.name,
          headline: content[0],
          location: content[1],
          degree,
          mutualConnections: mutualLine ? Number(mutualLine.match(/(\d+)/)?.[1] ?? 1) : undefined,
          source: step.source,
        });
        stepFound++;
      }
      await pause(14_000, 28_000);
    }
    report.push({ label: step.label, viewed: stepViewed, found: stepFound });
  }
  return { candidates, viewed, steps: report };
}

/** Beklenmedik boş sonuçta sayfanın ne gösterdiğini kayıtlar klasörüne yazar (düzeltme için). */
async function dumpDebug(page: Page, name: string): Promise<void> {
  try {
    const info = await page.evaluate(() => {
      const root = document.querySelector("main") ?? document.body;
      const links = Array.from(root.querySelectorAll("a")).map((a) => (a as HTMLAnchorElement).href).filter(Boolean);
      return {
        title: document.title,
        text: (root as HTMLElement).innerText.slice(0, 2500),
        linkCount: links.length,
        companyLinks: links.filter((h) => h.includes("/company/")).slice(0, 15),
        sampleLinks: links.slice(0, 25),
        listItems: root.querySelectorAll("li").length,
        firstHtml: root.innerHTML.slice(0, 3000),
      };
    });
    await writeFile(join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}.txt`), `${page.url()}\n\n${JSON.stringify(info, null, 2)}`);
  } catch {
    /* hata ayıklama çıktısı isteğe bağlıdır */
  }
}

/** LinkedIn sayfası okunurken yeniden yönlendirirse ("Execution context was destroyed") sayfa oturunca bir kez daha dener. */
async function retryNav<T>(page: Page, fn: () => Promise<T>, tries = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (i >= tries || !/execution context|navigat|target closed/i.test(msg)) throw e;
      await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
      await pause(1500, 2500);
    }
  }
}

/**
 * LinkedIn şirket aramasında sayfaları gezer; her şirket kartının adını, bağlantısını ve
 * ham metnini toplar. Ayrıştırma panelde yapılır. Süre dolarsa o ana dek bulunanı döner.
 */
export async function discoverCompanies(page: Page, queries: CompanyQueryPayload[], deadlineMs = 6 * 60_000): Promise<CompanyDiscoverData> {
  const t0 = Date.now();
  const companies: CompanyDiscoverData["companies"] = [];
  const seen = new Set<string>();
  const report: CompanyDiscoverData["queries"] = [];
  let viewed = 0;
  const readCards = () =>
    retryNav(page, () =>
        page.evaluate(() => {
          const root = document.querySelector("main") ?? document.body;
          const links = Array.from(root.querySelectorAll("a[href*='/company/']")) as HTMLAnchorElement[];
          const out: { href: string; name: string; text: string }[] = [];
          const seen = new Set<string>();
          for (const a of links) {
            const path = new URL(a.href).pathname.split("/").slice(0, 3).join("/");
            if (seen.has(path)) continue;
            const label = (a.innerText || a.getAttribute("aria-label") || "").split("\n").map((x) => x.trim()).find(Boolean) ?? "";
            let card: HTMLElement = a;
            for (let i = 0; i < 6 && card.parentElement && card.parentElement !== root; i++) {
              const par = card.parentElement;
              const others = Array.from(par.querySelectorAll("a[href*='/company/']")).filter((x) => new URL((x as HTMLAnchorElement).href).pathname.split("/").slice(0, 3).join("/") !== path);
              if (others.length || (par.innerText ?? "").length > 700) break;
              card = par;
            }
            const name = label || (card.innerText ?? "").split("\n").map((x) => x.trim()).find(Boolean) || "";
            if (!name) continue;
            seen.add(path);
            out.push({ href: a.href, name, text: card.innerText ?? "" });
          }
          return out;
        }),
    ).catch(() => null);
  for (const q of queries) {
    let found = 0;
    let pageBase = q.url;
    for (let p = 1; p <= q.maxPages; p++) {
      if (Date.now() - t0 > deadlineMs) break;
      await open(page, p === 1 ? pageBase : `${pageBase}&page=${p}`);
      await page.mouse.wheel(0, 1500).catch(() => undefined);
      await pause(1200, 2200);
      // Sayfa düzeni sık değiştiği için "li" yerine şirket bağlantılarından yola çıkılır:
      // her /company/ bağlantısının, yalnızca o şirketi içeren en büyük kapsayıcısı kart sayılır.
      let rows = await readCards();
      if (!rows?.length && p === 1) {
        // Sonuç yoksa önce konum süzgecini, sonra anahtar kelimedeki son sözcüğü (il adı) çıkarıp dener
        const u = new URL(q.url);
        const variants: string[] = [];
        const noGeo = new URL(u);
        noGeo.searchParams.delete("companyHqGeo");
        variants.push(noGeo.toString());
        const words = (u.searchParams.get("keywords") ?? "").split(" ");
        if (words.length > 1) {
          const short = new URL(noGeo);
          short.searchParams.set("keywords", words.slice(0, -1).join(" "));
          variants.push(short.toString());
        }
        for (const v of variants) {
          await dumpDebug(page, "sirket-arama-bos");
          await open(page, v);
          await page.mouse.wheel(0, 1500).catch(() => undefined);
          await pause(1200, 2200);
          rows = await readCards();
          if (rows?.length) {
            pageBase = v;
            break;
          }
        }
      }
      if (!rows?.length && p === 1) await dumpDebug(page, "sirket-arama-bos");
      if (!rows?.length) break;
      viewed += rows.length;
      for (const r of rows) {
        const key = r.href.split("?")[0]!;
        if (seen.has(key)) continue;
        seen.add(key);
        companies.push({ linkedinUrl: r.href, name: r.name, text: r.text });
        found++;
      }
      await pause(14_000, 28_000);
    }
    report.push({ label: q.label, found });
  }
  return { companies, viewed, queries: report };
}

/**
 * Şirket "Hakkında" sayfalarını gezer; web sitesi, sektör, büyüklük, merkez gibi ayrıntıları okur.
 * Etiket-değer çiftleri sayfadaki tanım listesinden (dt/dd) alınır; etiketler Türkçe ve İngilizce eşlenir.
 */
export async function enrichCompanies(page: Page, companies: { id: string; url: string }[], deadlineMs = 6 * 60_000): Promise<EnrichCompaniesData> {
  const t0 = Date.now();
  const items: CompanyDetail[] = [];
  for (const c of companies) {
    if (Date.now() - t0 > deadlineMs) break;
    await open(page, `${c.url.replace(/\/+$/, "")}/about/`);
    await pause(1200, 2200);
    const pairs = await retryNav(page, () => page.locator("main dl").evaluateAll((dls) =>
      dls.flatMap((dl) => {
        const out: { label: string; value: string }[] = [];
        let label = "";
        for (const el of Array.from(dl.children)) {
          if (el.tagName === "DT") label = (el as HTMLElement).innerText ?? "";
          else if (el.tagName === "DD" && label) {
            const a = el.querySelector("a[href^='http']") as HTMLAnchorElement | null;
            const href = a?.href ?? "";
            // Web sitesi LinkedIn yönlendirmesi üzerinden gelebilir; asıl adres "url" parametresindedir
            let value = (el as HTMLElement).innerText ?? "";
            if (/^(web ?sitesi|website)$/i.test(label.trim()) && href) {
              try {
                const u = new URL(href);
                value = u.searchParams.get("url") ?? href;
              } catch {
                value = href;
              }
            }
            out.push({ label, value });
          }
        }
        return out;
      }),
    )).catch(() => [] as { label: string; value: string }[]);
    items.push(parseAboutPairs(c.id, pairs));
    await pause(14_000, 28_000);
  }
  return { items };
}
