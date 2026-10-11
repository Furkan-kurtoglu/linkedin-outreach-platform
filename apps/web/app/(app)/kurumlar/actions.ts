"use server";
import { KIND_SEARCH, TR_PROVINCES, companyQueryUrls, expandByCity, fold, institutionKey, matchesExcludedCompany, parseMohHtml, parseOverpass, parsePaste, type InstitutionDraft, type InstitutionKind, type JobPayload } from "@hfo/core";
import { prisma, Prisma } from "@hfo/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, requireContext } from "@/lib/context";
import { enqueueEnrichment } from "@/lib/discover-queue";
import { applyCompanyExclusions } from "@/lib/institution-exclusions";
import { KIND_LABEL, institutionWhere, type InstSearch } from "@/lib/institution-filter";
import { readTargeting } from "@/lib/convert";
import { SEED } from "@/lib/institution-seed";

const MOH_URL = "https://shgmozelhasdb.saglik.gov.tr/TR-53567/ozel-hastane-listesi-faal.html";
const UA = "HeAlthFintelOutreach/1.0 (kurum listesi; iletisim: healthfintel.com.tr)";
const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();

/** Aynı kurumu bir kez tutar; var olanlara dokunmaz. Eklenen sayıyı döner. */
async function save(workspaceId: string, drafts: InstitutionDraft[]): Promise<number> {
  const rows = new Map<string, { workspaceId: string; key: string; name: string; rawName: string; kind: string; city: string | null; district: string | null; orgType: string | null; size: string | null; website: string | null; source: string }>();
  for (const d of drafts) {
    const key = institutionKey(d.name, d.city);
    if (!key.startsWith("|") && !rows.has(key)) {
      rows.set(key, { workspaceId, key, name: d.name, rawName: d.rawName, kind: d.kind, city: d.city ?? null, district: d.district ?? null, orgType: d.orgType ?? null, size: d.size ?? null, website: d.website ?? null, source: d.source });
    }
  }
  const list = [...rows.values()];
  let added = 0;
  for (let i = 0; i < list.length; i += 500) {
    added += (await prisma.institution.createMany({ data: list.slice(i, i + 500), skipDuplicates: true })).count;
  }
  // Ayarlar'daki hariç tutulan kurumlar havuza girse bile "Hariç" olarak işaretlenir
  await applyCompanyExclusions(workspaceId);
  return added;
}

const done = (kaynak: string, added: number, total: number) => {
  revalidatePath("/kurumlar");
  redirect(`/kurumlar?eklendi=${added}&toplam=${total}&kaynak=${kaynak}`);
};

/** Sağlık Bakanlığı faal özel hastane listesi (resmî, herkese açık sayfa) */
export async function importMoh(form: FormData) {
  const ctx = await requireContext();
  const il = clean(form.get("il"));
  const res = await fetch(MOH_URL, { headers: { "user-agent": UA, accept: "text/html" }, signal: AbortSignal.timeout(25_000), cache: "no-store" }).catch(() => null);
  if (!res?.ok) redirect("/kurumlar?hata=moh_erisim");
  const all = parseMohHtml(await res.text());
  if (!all.length) redirect("/kurumlar?hata=moh_bicim");
  const drafts = il ? all.filter((d) => fold(d.city ?? "") === fold(il)) : all;
  const added = await save(ctx.workspace.id, drafts);
  await audit(ctx, "institutions.import", { kaynak: "moh", il, added });
  done("moh", added, drafts.length);
}

/** OpenStreetMap (Overpass): hastane ve klinikler; kamu görünenler ayıklanır */
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const BBOX: Record<string, string> = { istanbul: "40.80,28.00,41.60,29.95" };

export async function importOsm(form: FormData) {
  const ctx = await requireContext();
  const il = clean(form.get("il")) || "İstanbul";
  const dental = !!form.get("dental");
  const amenity = dental ? "hospital|clinic|dentist" : "hospital|clinic";
  // İstanbul için sınır kutusu (hızlı); diğer iller için idari alan
  const box = BBOX[fold(il)];
  const scope = box ? `(${box})` : "(area.a)";
  const area = box ? "" : `area["name"="${il.replace(/["\\]/g, "")}"]["boundary"="administrative"]["admin_level"="4"]->.a;`;
  const query = `[out:json][timeout:25];${area}(nwr["amenity"~"^(${amenity})$"]["name"]${scope};);out tags;`;
  let json: { elements?: { tags?: Record<string, string> }[] } | null = null;
  const trace: string[] = [];
  for (const url of OVERPASS) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(27_000),
      cache: "no-store",
    }).catch((e: unknown) => ({ ok: false as const, status: 0, err: e instanceof Error ? e.name : "hata" }));
    if (res.ok) {
      json = (await (res as Response).json().catch(() => null)) as typeof json;
      if (json) break;
      trace.push(`${new URL(url).host}: yanıt okunamadı`);
    } else trace.push(`${new URL(url).host}: ${"err" in res ? res.err : (res as Response).status}`);
  }
  if (!json) redirect(`/kurumlar?hata=osm_erisim&ayrinti=${encodeURIComponent(trace.join(" | "))}`);
  const drafts = parseOverpass(json, il, { dental });
  const added = await save(ctx.workspace.id, drafts);
  await audit(ctx, "institutions.import", { kaynak: "osm", il, added });
  done("osm", added, drafts.length);
}

/** Yapıştırılan liste (Excel sütunları ya da satır satır) */
export async function importPaste(form: FormData) {
  const ctx = await requireContext();
  const kind = clean(form.get("tur"));
  const drafts = parsePaste(clean(form.get("liste")).slice(0, 400_000), { city: clean(form.get("il")) || undefined, kind: (["HOSPITAL", "MEDICAL_CENTER", "CLINIC", "DENTAL", "INSURER"].includes(kind) ? kind : undefined) as InstitutionKind | undefined });
  if (!drafts.length) redirect("/kurumlar?hata=bos");
  const added = await save(ctx.workspace.id, drafts);
  await audit(ctx, "institutions.import", { kaynak: "paste", added });
  done("paste", added, drafts.length);
}

/** Bilinen büyük gruplar ve sigortacılar */
export async function importSeed() {
  const ctx = await requireContext();
  const added = await save(ctx.workspace.id, SEED);
  await audit(ctx, "institutions.import", { kaynak: "seed", added });
  done("seed", added, SEED.length);
}

/** Seçili (ya da filtredeki tüm) kurumlar için toplu işlem */
export async function bulkInstitutions(form: FormData) {
  const ctx = await requireContext();
  const ws = ctx.workspace.id;
  const op = clean(form.get("op"));
  const sp: InstSearch = {};
  const base: Record<string, string> = {};
  for (const k of ["q", "tur", "ilce", "durum", "kaynak", "il", "boyut", "sektor"] as const) {
    const v = clean(form.get(`f_${k}`));
    if (v) {
      sp[k] = v;
      base[k] = v;
    }
  }
  const back = (extra: string) => `/kurumlar?${new URLSearchParams({ ...base, ...Object.fromEntries(new URLSearchParams(extra)) }).toString()}`;
  const scopeAll = clean(form.get("scope")) === "filtre";
  const ids = form.getAll("ids").map(String);
  if (!scopeAll && !ids.length) redirect(back("uyari=secim"));
  const where = scopeAll ? institutionWhere(ws, sp) : { workspaceId: ws, id: { in: ids } };

  if (op === "kampanya") {
    const agent = await prisma.agent.findFirst({ where: { id: clean(form.get("agentId")), workspaceId: ws }, select: { id: true, targeting: true } });
    if (!agent) redirect(back("uyari=kampanya"));
    const rows = await prisma.institution.findMany({ where: { AND: [where, { status: { not: "EXCLUDED" } }] }, select: { id: true, name: true, kind: true }, take: 3000 });
    const allowed = readTargeting(agent.targeting).institutionKinds as string[];
    const kindsInSel = [...new Set(rows.map((r) => r.kind))];
    // Tür güvenliği: kampanyanın hedef türleri varsa yalnızca onlar; yoksa karışık tür eklenemez
    if (!allowed.length && kindsInSel.length > 1) redirect(back(`uyari=karisik&turler=${encodeURIComponent(kindsInSel.map((k) => KIND_LABEL[k] ?? k).join(", "))}`));
    const matching = allowed.length ? rows.filter((r) => allowed.includes(r.kind)) : rows;
    const wrongKind = rows.length - matching.length;
    const rules = (await prisma.suppression.findMany({ where: { workspaceId: ws, kind: "company" }, select: { value: true } })).map((s) => s.value);
    const ok = matching.filter((r) => !rules.some((rule) => matchesExcludedCompany(r.name, rule)));
    const created = await prisma.targetAccount.createMany({ data: ok.map((r) => ({ agentId: agent.id, name: r.name, origin: "kurum" })), skipDuplicates: true });
    await prisma.institution.updateMany({ where: { id: { in: ok.map((r) => r.id) } }, data: { status: "SELECTED" } });
    await audit(ctx, "institutions.to_campaign", { agentId: agent.id, added: created.count, skipped: matching.length - ok.length, wrongKind });
    revalidatePath("/kurumlar");
    redirect(back(`kampanya=${created.count}&atlanan=${matching.length - ok.length}&tur_uyumsuz=${wrongKind}`));
  }
  if (op === "haric" || op === "yeni") {
    const r = await prisma.institution.updateMany({ where, data: { status: op === "haric" ? "EXCLUDED" : "NEW" } });
    revalidatePath("/kurumlar");
    redirect(back(`islem=${op}&n=${r.count}`));
  }
  if (op === "sil") {
    const r = await prisma.institution.deleteMany({ where });
    revalidatePath("/kurumlar");
    redirect(back(`islem=sil&n=${r.count}`));
  }
  redirect(back(""));
}

/**
 * LinkedIn şirket araması: anahtar kelimelerle şirket sayfalarını tarar, bulunanları havuza ekler.
 * Güncel kaynak LinkedIn'in kendisidir; iş yerel çalışan açıkken çalışır.
 */
export async function findCompaniesOnLinkedIn(form: FormData) {
  const ctx = await requireContext();
  const custom = clean(form.get("anahtar")).split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean);
  const kinds = form.getAll("turler").map(String).filter((k): k is InstitutionKind => !!KIND_SEARCH[k as InstitutionKind]);
  if (!custom.length && !kinds.length) redirect("/kurumlar?hata=anahtar");
  const fallback = clean(form.get("tur"));
  const pages = Math.min(Math.max(Math.floor(+clean(form.get("sayfa"))) || 3, 1), 5);
  // Seçilen iller (onay kutuları); hiç seçilmezse şehir eklenmez (Türkiye geneli tek arama)
  const picked = new Set(form.getAll("sehir").map(String));
  const cities = TR_PROVINCES.filter((c) => picked.has(c));
  const account = await prisma.linkedinAccount.findFirst({ where: { workspaceId: ctx.workspace.id, status: { not: "DISCONNECTED" } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!account) redirect("/kurumlar?hata=hesap");
  const open = await prisma.job.count({ where: { linkedinAccountId: account.id, type: "DISCOVER_COMPANIES", status: { in: ["PENDING", "RUNNING"] } } });
  if (open >= 100) redirect("/kurumlar?hata=bekleyen");
  // Her tür kendi sözcükleriyle ve kendi türüyle aranır; kullanıcının yazdığı sözcükler ayrı bir grup olur.
  // Anahtar kelime x il çarpılır; çalışanın sekiz dakikalık iş sınırı için her iş en çok 6 aramayı kapsar.
  const groups: { kind?: string; keywords: string[]; byCity: boolean }[] = [
    ...kinds.map((k) => ({ kind: k, keywords: KIND_SEARCH[k]!.keywords, byCity: KIND_SEARCH[k]!.byCity })),
    ...(custom.length ? [{ kind: fallback || undefined, keywords: custom, byCity: true }] : []),
  ];
  const cap = Math.max(30, Math.floor(600 / groups.length));
  let queries = 0;
  let jobs = 0;
  for (const g of groups) {
    const kws = g.byCity ? g.keywords.slice(0, cities.length > 20 ? 3 : 8) : g.keywords;
    const all = (g.byCity ? expandByCity(kws, cities) : kws).slice(0, cap);
    for (let i = 0; i < all.length; i += 6) {
      const qs = companyQueryUrls(all.slice(i, i + 6), { maxPages: g.byCity ? pages : 5 });
      if (!qs.length) continue;
      const payload: JobPayload = { type: "DISCOVER_COMPANIES", queries: qs, kind: g.kind };
      await prisma.job.create({ data: { linkedinAccountId: account.id, type: "DISCOVER_COMPANIES", priority: 35, runAfter: new Date(), payload: payload as unknown as Prisma.InputJsonValue } });
      jobs++;
    }
    queries += all.length;
  }
  await audit(ctx, "institutions.linkedin_search", { queries, jobs, pages, cities: cities.length, kinds });
  revalidatePath("/kurumlar");
  redirect(`/kurumlar?aranacak=${queries}&is=${jobs}`);
}

/** LinkedIn'den bulunup ayrıntısı okunmamış şirketler için "Hakkında" okuma işlerini başlatır. */
export async function enrichInstitutions() {
  const ctx = await requireContext();
  const n = await enqueueEnrichment(ctx.workspace.id, 150);
  revalidatePath("/kurumlar");
  redirect(`/kurumlar?ayrinti_is=${n}`);
}
