/**
 * LinkedIn işlemleri. LinkedIn arayüzü zaman zaman değişir; seçiciler önce erişilebilirlik
 * etiketlerine ve görünen metne (Türkçe ve İngilizce) dayanır, sınıf adlarına en son başvurulur.
 * Bir işlem beklenmedik bir ekranla karşılaşırsa ekran görüntüsü ~/.hfo-runner/kayitlar altına
 * kaydedilir ve iş "geçici hata" olarak bildirilir; hiçbir şey tahminle gönderilmez.
 */
import {
  canonicalProfileUrl,
  type ConnectionsData,
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

export async function readSelf(page: Page): Promise<SelfInfo> {
  await open(page, "https://www.linkedin.com/in/me/");
  const profileUrl = canonicalProfileUrl(page.url()) ?? undefined;
  const fullName = (await page.locator("main h1").first().innerText({ timeout: 10_000 }).catch(() => ""))?.trim() || undefined;
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
  const fullName = (await page.locator("main h1").first().innerText({ timeout: 15_000 }).catch(() => ""))?.trim() || undefined;
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

  return { fullName, headline, location, company, degree, mutualName, mutualConnections, invitePending, openProfile, about, sharedSchool, recentPostText };
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

export async function discover(page: Page, steps: DiscoverStepPayload[], viewBudget: number): Promise<DiscoverData> {
  const candidates: DiscoverCandidate[] = [];
  const report: DiscoverData["steps"] = [];
  let viewed = 0;
  for (const step of steps) {
    if (viewed >= viewBudget) break;
    let stepViewed = 0;
    let stepFound = 0;
    for (let p = 1; p <= step.maxPages && viewed < viewBudget; p++) {
      const url = p === 1 ? step.url : `${step.url}&page=${p}`;
      await open(page, url);
      await page.mouse.wheel(0, 1500).catch(() => undefined);
      await pause(1200, 2200);
      const rows = await page.locator("main li").evaluateAll((lis) =>
        lis
          .map((li) => {
            const a = li.querySelector("a[href*='/in/']") as HTMLAnchorElement | null;
            if (!a) return null;
            const nameEl = a.querySelector("span[aria-hidden='true']") as HTMLElement | null;
            return { href: a.href, name: (nameEl?.innerText ?? a.innerText ?? "").split("\n")[0]!.trim(), text: (li as HTMLElement).innerText };
          })
          .filter((x): x is { href: string; name: string; text: string } => !!x && !!x.name),
      );
      if (!rows.length) break;
      viewed += rows.length;
      stepViewed += rows.length;
      for (const r of rows) {
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
      await pause(3500, 8000);
    }
    report.push({ label: step.label, viewed: stepViewed, found: stepFound });
  }
  return { candidates, viewed, steps: report };
}
