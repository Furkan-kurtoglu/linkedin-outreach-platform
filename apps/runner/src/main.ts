/**
 * HeAlthFintel yerel çalışanı.
 *
 * Bilgisayarınızda açık kaldığı sürece panelden sıradaki işi ister (profil ziyareti, davet,
 * mesaj…), işi kendi Chrome penceresinde yapar ve sonucu bildirir. LinkedIn şifreniz
 * istenmez ve saklanmaz: ilk açılışta açılan pencerede LinkedIn'e kendiniz giriş yaparsınız,
 * oturum yalnızca bu bilgisayardaki ayrı Chrome profilinde kalır.
 *
 * Kullanım:  pnpm runner            (çalıştır)
 *            pnpm runner --kontrol  (yalnızca kendi profilinizi okuyup seçicileri dener)
 *            pnpm runner --sifirla  (bağlantı anahtarını yeniden sorar)
 */
import type { JobPayload, JobResult, RunnerJob } from "@hfo/core";
import { mkdtemp, writeFile } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { AuthError, PanelApi } from "./api";
import { LOG_DIR, PROFILE_DIR, loadConfig, resetConfig } from "./config";
import { discover, discoverCompanies, enrichCompanies, isLoggedIn, readInbox, readSelf, recentConnections, sendInvite, sendMessage, sentInvites, visitProfile, withdrawInvite, type SelfInfo } from "./linkedin/actions";
import { JobError, pause, sleep } from "./linkedin/util";

const VERSION = "0.1.0";
const PLATFORM = platform() === "win32" ? "Windows" : platform() === "darwin" ? "Mac" : "Linux";
/** İki gönderim (davet/mesaj) arası en az bekleme; planlayıcının aralıklarına ek güvenlik */
const MIN_SEND_GAP_MS = 45_000;
const JOB_TIMEOUT_MS = 8 * 60_000;

const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString("tr-TR"), ...a);

/** Bulut modu: ekransız Chrome; LinkedIn oturumu LI_AT ortam değişkeninden (kullanıcının kendi çerezi) alınır. */
async function launchCloud(): Promise<BrowserContext> {
  const dir = await mkdtemp(join(tmpdir(), "hfo-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    headless: true,
    viewport: { width: 1280, height: 860 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const li = (process.env.LI_AT ?? "").trim();
  if (li) await ctx.addCookies([{ name: "li_at", value: li, domain: ".linkedin.com", path: "/", secure: true, httpOnly: true, sameSite: "None" }]);
  return ctx;
}

async function launch(): Promise<BrowserContext> {
  const opts: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless: false,
    viewport: { width: 1280, height: 860 },
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    args: ["--disable-blink-features=AutomationControlled"],
  };
  try {
    // Bilgisayardaki Google Chrome kullanılır (ayrıca tarayıcı indirmeye gerek yok)
    return await chromium.launchPersistentContext(PROFILE_DIR, { ...opts, channel: "chrome" });
  } catch (e) {
    console.error("\nGoogle Chrome başlatılamadı. Chrome kurulu değilse https://www.google.com/chrome adresinden kurun.");
    console.error("Chrome kuruluysa ve bu hata sürüyorsa: Chrome'un başka bir 'chrome-profili' penceresi açık olmadığından emin olun.\n");
    throw e;
  }
}

async function waitForLogin(page: Page, api: PanelApi) {
  if (await isLoggedIn(page)) return;
  await api.status({ loggedIn: false }).catch(() => undefined);
  await page.goto("https://www.linkedin.com/login", { waitUntil: "domcontentloaded" }).catch(() => undefined);
  console.log("\n>>> Açılan Chrome penceresinde LinkedIn'e giriş yapın. Şifreniz bu program tarafından okunmaz ve saklanmaz.");
  console.log(">>> Giriş yaptıktan sonra bu pencere kendiliğinden devam eder.\n");
  for (;;) {
    await sleep(10_000);
    const url = page.url();
    if (url.includes("linkedin.com/feed") || url.includes("linkedin.com/in/")) break;
    if (!/linkedin\.com\/(login|checkpoint|uas|authwall)/.test(url) && url.includes("linkedin.com")) {
      if (await isLoggedIn(page)) break;
    }
  }
  log("LinkedIn oturumu açık.");
}

async function shot(page: Page, name: string) {
  const base = join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-${name}`);
  await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => undefined);
  await writeFile(`${base}.url.txt`, page.url()).catch(() => undefined);
}

async function runJob(page: Page, api: PanelApi, self: SelfInfo, job: RunnerJob, inboxSeen: Map<string, string>): Promise<JobResult> {
  const p: JobPayload = job.payload;
  switch (p.type) {
    case "VISIT_PROFILE":
      return { ok: true, data: await visitProfile(page, p.profileUrl, { readPost: p.readPost, readEducation: p.readEducation, mySchools: self.schools }) };
    case "SEND_INVITE":
      return { ok: true, data: await sendInvite(page, p.profileUrl, p.note) };
    case "SEND_MESSAGE":
      await sendMessage(page, p.profileUrl, p.text, {
        attachment: p.attachment ? () => api.file(p.attachment!.fileId) : undefined,
        // Açık profil dışında mesaj yalnızca bağlantılara gider; InMail kredisi yanlışlıkla harcanmaz
        requireConnection: !p.viaOpenProfile,
        subject: p.viaOpenProfile ? "Kısa bir tanışma" : undefined,
      });
      return { ok: true };
    case "SEND_INMAIL":
      return { ok: true, data: await sendMessage(page, p.profileUrl, p.text, { subject: p.subject }) };
    case "WITHDRAW_INVITE":
      await withdrawInvite(page, p.profileUrl);
      return { ok: true };
    case "CHECK_CONNECTIONS":
      return { ok: true, data: await recentConnections(page, p.limit) };
    case "CHECK_INBOX":
      return { ok: true, data: await readInbox(page, p.limit, self.fullName, inboxSeen) };
    case "SYNC_SENT_INVITES":
      return { ok: true, data: await sentInvites(page) };
    case "DISCOVER":
      return { ok: true, data: await discover(page, p.steps, p.viewBudget) };
    case "DISCOVER_COMPANIES":
    {
      const data = await discoverCompanies(page, p.queries);
      log(`  ${data.companies.length} şirket okundu (${data.queries.map((q) => `${q.label}: ${q.found}`).join(", ")})`);
      if (!data.companies.length) log("  Hiç şirket kartı okunamadı; 'kayitlar' klasörüne sayfa dökümü yazıldı.");
      await writeFile(join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}-sirket-arama-ozet.txt`), JSON.stringify({ queries: data.queries, sample: data.companies.slice(0, 5) }, null, 2)).catch(() => undefined);
      return { ok: true, data };
    }
    case "ENRICH_COMPANIES":
      return { ok: true, data: await enrichCompanies(page, p.companies) };
  }
}

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new JobError("transient", "İş zaman aşımına uğradı.")), ms))]);

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--sifirla")) {
    await resetConfig();
    console.log("Bağlantı anahtarı silindi. Yeniden başlatınca sorulacak.");
    return;
  }
  const cfg = await loadConfig();
  const api = new PanelApi(cfg);
  const me = await api.hello(VERSION, PLATFORM).catch((e) => {
    if (e instanceof AuthError) {
      console.error("\nBağlantı anahtarı geçersiz. Panelden yeni anahtar oluşturup 'pnpm runner --sifirla' ile yeniden girin.\n");
      process.exit(1);
    }
    throw e;
  });
  log(`Panele bağlandı: ${me.displayName}`);

  const cloud = args.includes("--bulut");
  const ctx = cloud ? await launchCloud() : await launch();
  let page = ctx.pages()[0] ?? (await ctx.newPage());
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    log("Kapatılıyor…");
    await ctx.close().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  ctx.on("close", () => {
    if (!stopping) {
      log("Chrome penceresi kapatıldı; çalışan durdu.");
      process.exit(0);
    }
  });

  if (cloud) {
    if (!(await isLoggedIn(page))) {
      await api.status({ loggedIn: false }).catch(() => undefined);
      console.error("LinkedIn oturumu açılamadı: LI_AT çerezi geçersiz ya da süresi dolmuş. Yenisini GitHub gizli değişkenlerine ekleyin.");
      await ctx.close().catch(() => undefined);
      process.exit(2);
    }
  } else await waitForLogin(page, api);
  const self = await readSelf(page).catch(() => ({ schools: [] }) as SelfInfo);
  await api.status({ loggedIn: true, profileUrl: self.profileUrl, premium: self.premium });
  log(`Hesap: ${self.fullName ?? "okunamadı"}${self.premium ? " (Premium)" : ""}`);

  if (args.includes("--kontrol")) {
    console.log("\nKontrol tamam. Profil okundu:", { ad: self.fullName, premium: self.premium, okullar: self.schools });
    await stop();
    return;
  }

  const inboxSeen = new Map<string, string>();
  let lastSendAt = 0;
  let lastLoginCheck = Date.now();
  const deadline = cloud ? Date.now() + (Number(process.env.HFO_BULUT_DAKIKA) || 20) * 60_000 : Number.POSITIVE_INFINITY;
  let idle = 0;
  if (cloud) log("Bulut modu: yalnızca arama işleri alınır (davet ve mesaj gönderilmez).");
  log("Çalışıyor. Bu pencereyi ve Chrome'u açık bırakın; bilgisayar uykuya geçerse işler açılınca devam eder.");

  // Uzun işler sırasında poll yapılmadığı için panel çalışanı "kapalı" sanmasın: her dakika sinyal
  setInterval(() => void api.hello(VERSION, PLATFORM).catch(() => undefined), 60_000).unref();

  while (!stopping) {
    if (Date.now() > deadline) {
      log("Bulut süresi doldu; kapatılıyor.");
      await stop();
    }
    try {
      if (!cloud && Date.now() - lastLoginCheck > 30 * 60_000) {
        lastLoginCheck = Date.now();
        if (!(await isLoggedIn(page))) {
          await waitForLogin(page, api);
          await api.status({ loggedIn: true, profileUrl: self.profileUrl });
        }
      }
      const res = await api.poll(cloud);
      if (cloud && res.account.status === "NEEDS_LOGIN") {
        log("Hesap oturum bekliyor; bulut çalışanı durdu.");
        await stop();
      }
      if (res.account.status === "NEEDS_LOGIN") {
        if (await isLoggedIn(page)) await api.status({ loggedIn: true, profileUrl: self.profileUrl });
        else await waitForLogin(page, api);
        continue;
      }
      if (!res.job) {
        // Bulutta dakika sınırlıdır: üst üste iş çıkmazsa erken kapanır
        if (cloud && ++idle >= 3) {
          log("Sırada iş yok; kapatılıyor.");
          await stop();
        }
        await sleep(res.sleepSec * 1000);
        continue;
      }
      idle = 0;
      const job = res.job;
      const sending = ["SEND_INVITE", "SEND_MESSAGE", "SEND_INMAIL", "WITHDRAW_INVITE"].includes(job.payload.type);
      if (sending) {
        const wait = lastSendAt + MIN_SEND_GAP_MS + Math.random() * 30_000 - Date.now();
        if (wait > 0) await sleep(wait);
      }
      log(`İş: ${job.payload.type}${"profileUrl" in job.payload ? ` · ${job.payload.profileUrl}` : ""}`);
      let result: JobResult;
      try {
        result = await withTimeout(runJob(page, api, self, job, inboxSeen), JOB_TIMEOUT_MS);
      } catch (e) {
        const err = e instanceof JobError ? e : new JobError("transient", e instanceof Error ? e.message : String(e));
        if (err.code === "transient" || err.code === "linkedin_warning") await shot(page, job.payload.type);
        result = { ok: false, error: err.code, message: err.message };
        log(`  sonuç: hata (${err.code}) ${err.message}`);
        // Zaman aşımında eski iş arka planda sürüp aynı sekmeyi kullanmasın: sekmeyi kapatıp yenisini aç
        if (/zaman aşımı/.test(err.message)) {
          const old = page;
          page = await ctx.newPage();
          await old.close().catch(() => undefined);
        }
      }
      if (result.ok) log("  sonuç: tamam");
      if (sending) lastSendAt = Date.now();
      await api.result(job.id, result);
      if (!result.ok && (result.error === "linkedin_warning" || result.error === "invite_limit")) {
        log("LinkedIn uyarısı nedeniyle gönderim 24 saat duraklatıldı. Lütfen LinkedIn'i tarayıcıdan kontrol edin.");
      }
      await pause(3000, 9000);
    } catch (e) {
      if (e instanceof AuthError) {
        console.error("\nBağlantı anahtarı geçersiz oldu (panelde yenilenmiş olabilir). 'pnpm runner --sifirla' ile yeni anahtarı girin.\n");
        await stop();
        return;
      }
      log("Bağlantı sorunu; 1 dakika sonra tekrar denenecek.", e instanceof Error ? e.message : e);
      await sleep(60_000);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
