/**
 * Sektörden bağımsız hedefleme stratejisi. Yapay zekâsızdır: bilinen sektörler için hazır sözlük,
 * bilinmeyenler için yazılan sözcüklerden türetilen genel kural kullanır. Her sektörde aynı iskelet
 * işler: (1) şirketi bul, (2) boyuta göre doğru karar vericiyi seç, (3) alakasızları ele.
 */
import { fold } from "./text";

export type StrategyFunction = "genel" | "teknoloji" | "finans" | "satis" | "pazarlama" | "operasyon" | "ik" | "satinalma";
export type StrategySize = "kucuk" | "orta" | "buyuk" | "hepsi";

export const FUNCTION_LABEL: Record<StrategyFunction, string> = {
  genel: "Genel yönetim (sahip, genel müdür)",
  teknoloji: "Teknoloji ve dijital",
  finans: "Finans ve muhasebe",
  satis: "Satış ve iş geliştirme",
  pazarlama: "Pazarlama ve marka",
  operasyon: "Operasyon ve üretim",
  ik: "İnsan kaynakları ve yan haklar",
  satinalma: "Satın alma ve tedarik",
};

export const SIZE_STRATEGY_LABEL: Record<StrategySize, string> = { kucuk: "Küçük (sahip/kurucu)", orta: "Orta", buyuk: "Büyük", hepsi: "Hepsi" };

interface Sector {
  id: string;
  label: string;
  aliases: string[];
  /** LinkedIn şirket aramasında denenecek sözcükler (Türkçe ve İngilizce) */
  search: string[];
  /** Şirket adı/başlığında geçmesi beklenen sözcükler (puanlamada gerekli) */
  must: string[];
  /** Kapsam dışı bırakılacak şirket türleri */
  not: string[];
  /** Sektöre özgü ek unvanlar */
  titles: string[];
}

const SECTORS: Sector[] = [
  { id: "saglik", label: "Sağlık", aliases: ["saglik", "hastane", "klinik", "health", "medikal", "hospital", "clinic", "tip"], search: ["özel hastane", "tıp merkezi", "özel klinik", "estetik klinik", "diş kliniği", "private hospital", "medical center", "healthcare group"], must: ["hastane", "klinik", "tıp", "sağlık", "hospital", "clinic", "medical", "health"], not: ["devlet hastanesi", "üniversite", "belediye"], titles: ["Başhekim", "Medical Director", "Hasta Hizmetleri Müdürü", "Patient Experience Director"] },
  { id: "gida", label: "Gıda ve içecek", aliases: ["gida", "yiyecek", "icecek", "food", "beverage", "fmcg"], search: ["gıda üretimi", "gıda sanayi", "içecek", "süt ürünleri", "et ve et ürünleri", "food manufacturing", "beverage company", "food and beverage"], must: ["gıda", "food", "içecek", "beverage", "süt", "dairy", "et ", "unlu", "bakery"], not: ["restoran", "kafe", "catering"], titles: ["Kalite Müdürü", "Quality Manager", "Gıda Güvenliği Müdürü", "Üretim Müdürü", "Plant Manager", "Ar-Ge Müdürü", "Tedarik Zinciri Müdürü", "Supply Chain Director", "İhracat Müdürü", "Export Manager"] },
  { id: "otomotiv", label: "Otomotiv", aliases: ["otomotiv", "arac", "araba", "automotive", "yan sanayi", "bayi"], search: ["otomotiv yan sanayi", "otomotiv bayisi", "otomotiv", "araç kiralama", "automotive supplier", "car dealership", "automotive manufacturing"], must: ["otomotiv", "automotive", "oto ", "araç", "motor", "bayi", "dealer"], not: ["oto yıkama", "oto kuaför"], titles: ["Bayi Müdürü", "Dealer Principal", "Satış Sonrası Hizmetler Müdürü", "Aftersales Manager", "Fabrika Müdürü", "Plant Manager", "Ar-Ge Müdürü", "Satın Alma Müdürü", "Filo Satış Müdürü", "Fleet Sales Manager"] },
  { id: "finans", label: "Finans ve sigorta", aliases: ["finans", "sigorta", "banka", "emeklilik", "insurance", "bank", "fintech"], search: ["sigorta şirketi", "sigorta aracılık", "emeklilik", "banka", "insurance company", "insurance broker", "fintech"], must: ["sigorta", "insurance", "banka", "bank", "finans", "emeklilik", "fintech"], not: ["muhasebe bürosu"], titles: ["Hasar Müdürü", "Claims Director", "Aktüerya Müdürü", "Ürün Müdürü", "Product Director", "Acente Satış Müdürü", "Bancassurance"] },
  { id: "perakende", label: "Perakende ve e-ticaret", aliases: ["perakende", "market", "magaza", "e-ticaret", "retail", "ecommerce"], search: ["perakende", "mağaza zinciri", "e-ticaret", "süpermarket", "retail chain", "e-commerce company"], must: ["perakende", "retail", "mağaza", "market", "e-ticaret", "commerce"], not: [], titles: ["Mağazacılık Müdürü", "Retail Director", "Kategori Müdürü", "Category Manager", "E-ticaret Müdürü", "Head of E-commerce", "Omnichannel"] },
  { id: "lojistik", label: "Lojistik ve taşımacılık", aliases: ["lojistik", "tasimacilik", "nakliye", "logistics", "supply chain", "kargo"], search: ["lojistik", "taşımacılık", "nakliyat", "depolama", "logistics company", "freight forwarding", "cargo"], must: ["lojistik", "logistics", "taşımacılık", "nakliyat", "freight", "kargo", "cargo"], not: [], titles: ["Lojistik Müdürü", "Logistics Director", "Filo Müdürü", "Fleet Manager", "Depo Müdürü", "Warehouse Manager", "Gümrük Müdürü"] },
  { id: "enerji", label: "Enerji", aliases: ["enerji", "elektrik", "gunes", "energy", "solar", "dogalgaz"], search: ["enerji şirketi", "güneş enerjisi", "elektrik üretimi", "doğalgaz", "energy company", "renewable energy", "solar"], must: ["enerji", "energy", "elektrik", "solar", "güneş", "gaz"], not: [], titles: ["Saha Operasyon Müdürü", "Santral Müdürü", "Plant Manager", "Proje Müdürü", "Project Director", "Ticaret Müdürü", "Energy Trading"] },
  { id: "insaat", label: "İnşaat ve gayrimenkul", aliases: ["insaat", "gayrimenkul", "emlak", "construction", "real estate", "muteahhit"], search: ["inşaat", "müteahhitlik", "gayrimenkul geliştirme", "gayrimenkul yatırım", "construction company", "real estate developer"], must: ["inşaat", "construction", "gayrimenkul", "real estate", "yapı", "emlak"], not: [], titles: ["Proje Müdürü", "Project Director", "Şantiye Şefi", "Satış Müdürü", "Sales Director", "Yatırım Müdürü", "Development Director"] },
  { id: "egitim", label: "Eğitim", aliases: ["egitim", "okul", "universite", "kurs", "education", "school", "edtech"], search: ["özel okul", "eğitim kurumları", "kurs merkezi", "dil okulu", "private school", "education company", "edtech"], must: ["eğitim", "okul", "education", "school", "akademi", "academy", "kurs"], not: ["devlet"], titles: ["Okul Müdürü", "Principal", "Kurucu Temsilcisi", "Eğitim Direktörü", "Academic Director", "Kayıt Müdürü", "Admissions Director"] },
  { id: "uretim", label: "Üretim ve sanayi", aliases: ["uretim", "sanayi", "imalat", "fabrika", "manufacturing", "industrial", "makine"], search: ["üretim şirketi", "sanayi", "imalat", "makine üretimi", "manufacturing company", "industrial manufacturer"], must: ["üretim", "sanayi", "imalat", "makine", "manufactur", "industrial"], not: [], titles: ["Fabrika Müdürü", "Plant Manager", "Üretim Müdürü", "Production Director", "Kalite Müdürü", "Bakım Müdürü", "Ar-Ge Müdürü"] },
  { id: "turizm", label: "Turizm ve otelcilik", aliases: ["turizm", "otel", "konaklama", "tourism", "hotel", "hospitality"], search: ["otel", "turizm şirketi", "tatil köyü", "seyahat acentesi", "hotel group", "hospitality", "travel agency"], must: ["otel", "hotel", "turizm", "tourism", "resort", "seyahat", "travel"], not: [], titles: ["Otel Müdürü", "General Manager", "Ön Büro Müdürü", "Front Office Manager", "Revenue Manager", "Satış ve Pazarlama Müdürü", "Director of Sales"] },
  { id: "tekstil", label: "Tekstil ve hazır giyim", aliases: ["tekstil", "giyim", "konfeksiyon", "textile", "apparel", "moda"], search: ["tekstil", "hazır giyim", "konfeksiyon", "ev tekstili", "textile manufacturer", "apparel company"], must: ["tekstil", "textile", "giyim", "apparel", "konfeksiyon", "moda", "fashion"], not: [], titles: ["Üretim Müdürü", "Tasarım Müdürü", "Design Director", "İhracat Müdürü", "Export Manager", "Satın Alma Müdürü", "Merchandising Manager"] },
  { id: "tarim", label: "Tarım ve hayvancılık", aliases: ["tarim", "hayvancilik", "ciftlik", "agriculture", "agri", "sera"], search: ["tarım", "hayvancılık", "tarım teknolojileri", "sera", "agriculture company", "agritech"], must: ["tarım", "agri", "hayvancılık", "çiftlik", "farm", "sera"], not: [], titles: ["Çiftlik Müdürü", "Farm Manager", "Üretim Müdürü", "Ziraat Mühendisi", "Agronomist", "İhracat Müdürü"] },
  { id: "yazilim", label: "Yazılım ve teknoloji", aliases: ["yazilim", "teknoloji", "software", "saas", "bilisim", "tech", "startup"], search: ["yazılım şirketi", "bilişim", "teknoloji", "SaaS", "software company", "IT services", "startup"], must: ["yazılım", "software", "bilişim", "teknoloji", "technology", "saas", "digital"], not: [], titles: ["CTO", "Chief Technology Officer", "VP Engineering", "Head of Product", "Product Director", "Engineering Manager", "Head of Sales", "Partnerships"] },
  { id: "reklam", label: "Medya, reklam ve ajans", aliases: ["reklam", "ajans", "medya", "advertising", "agency", "marketing agency", "medya"], search: ["reklam ajansı", "dijital ajans", "medya", "halkla ilişkiler", "advertising agency", "digital agency", "pr agency"], must: ["reklam", "ajans", "agency", "medya", "media", "advertising", "pr"], not: [], titles: ["Ajans Başkanı", "Managing Partner", "Creative Director", "Yaratıcı Direktör", "Account Director", "Müşteri İlişkileri Direktörü"] },
];

/** İşlevlere göre unvanlar (tüm sektörlerde ortak) */
const FUNC_TITLES: Record<StrategyFunction, { orta: string[]; buyuk: string[] }> = {
  genel: { orta: [], buyuk: ["Genel Müdür Yardımcısı", "Deputy General Manager", "Chief Operating Officer", "COO", "Direktör", "Director"] },
  teknoloji: { orta: ["Bilgi İşlem Müdürü", "IT Manager", "Dijital Dönüşüm Müdürü", "Digital Transformation Manager"], buyuk: ["Chief Information Officer", "CIO", "CTO", "Bilgi Teknolojileri Direktörü", "Head of Digital", "VP Technology"] },
  finans: { orta: ["Mali İşler Müdürü", "Finance Manager", "Muhasebe Müdürü", "Controller"], buyuk: ["Finans Direktörü", "Chief Financial Officer", "CFO", "Mali İşler Direktörü", "VP Finance"] },
  satis: { orta: ["Satış Müdürü", "Sales Manager", "İş Geliştirme Müdürü", "Business Development Manager"], buyuk: ["Satıştan Sorumlu Genel Müdür Yardımcısı", "Satış Direktörü", "Sales Director", "Chief Commercial Officer", "CCO", "VP Sales", "Head of Business Development"] },
  pazarlama: { orta: ["Pazarlama Müdürü", "Marketing Manager", "Marka Müdürü", "Brand Manager"], buyuk: ["Pazarlama Direktörü", "Chief Marketing Officer", "CMO", "VP Marketing", "Head of Marketing"] },
  operasyon: { orta: ["Operasyon Müdürü", "Operations Manager"], buyuk: ["Operasyon Direktörü", "Chief Operating Officer", "COO", "VP Operations", "Head of Operations"] },
  ik: { orta: ["İnsan Kaynakları Müdürü", "HR Manager", "Yan Haklar Uzmanı", "Compensation and Benefits Manager"], buyuk: ["İnsan Kaynakları Direktörü", "Chief People Officer", "CHRO", "HR Director", "VP People"] },
  satinalma: { orta: ["Satın Alma Müdürü", "Procurement Manager", "Purchasing Manager"], buyuk: ["Satın Alma Direktörü", "Procurement Director", "Chief Procurement Officer", "Tedarik Zinciri Direktörü", "Head of Procurement"] },
};

const OWNER_TITLES = ["Kurucu", "Founder", "Co-Founder", "Kurucu Ortak", "Sahibi", "Owner", "Yönetim Kurulu Başkanı", "Chairman", "CEO", "Genel Müdür", "General Manager", "Managing Director", "İcra Kurulu Başkanı"];

/** Hiçbir sektörde istenmeyen unvanlar */
export const UNIVERSAL_EXCLUDED_TITLES = ["Stajyer", "Intern", "Öğrenci", "Student", "Freelance", "Serbest Çalışan", "Yönetici Asistanı", "Executive Assistant", "Recruiter", "İşe Alım", "Emekli", "Retired", "Tekniker", "Teknisyen", "Diyetisyen", "Psikolog", "Fizyoterapist", "Hemşire", "Eczacı", "Laborant", "Sekreter"];

export interface StrategyInput {
  sector: string;
  functions?: StrategyFunction[];
  size?: StrategySize;
}

export interface StrategyPlan {
  sectorLabel: string;
  /** Bilinen bir sektöre eşleşti mi; değilse genel kural kullanıldı */
  known: boolean;
  companyKeywords: string[];
  requiredCompanyKeywords: string[];
  excludedCompanyKeywords: string[];
  titles: string[];
  excludedTitles: string[];
  notes: string[];
}

export function findSector(text: string): Sector | null {
  const t = fold(text);
  if (!t) return null;
  const words = t.split(/[^a-z0-9]+/).filter(Boolean);
  // Kısa takılar (ör. "tip") yalnızca tam sözcük olarak eşleşir
  const hit = (a: string) => (a.length <= 3 ? words.includes(a) : t.includes(a));
  return SECTORS.find((s) => fold(s.label) === t || s.aliases.some((a) => hit(fold(a)))) ?? null;
}

const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.filter((x) => {
    const k = fold(x);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** Sektör + işlev + boyuttan hedefleme önerisi. Aynı girdi her zaman aynı çıktıyı verir. */
export function strategyFor(input: StrategyInput): StrategyPlan {
  const sector = findSector(input.sector);
  const raw = input.sector.trim();
  const size = input.size ?? "hepsi";
  const funcs: StrategyFunction[] = input.functions?.length ? input.functions : ["genel"];
  const notes: string[] = [];

  const titles: string[] = [...OWNER_TITLES];
  if (size !== "kucuk") {
    for (const f of funcs) {
      titles.push(...FUNC_TITLES[f].orta);
      if (size !== "orta") titles.push(...FUNC_TITLES[f].buyuk);
    }
    if (sector) titles.push(...sector.titles);
  }
  if (size === "kucuk") notes.push("Küçük işletmelerde karar veren genellikle sahibi ya da kurucudur; bu yüzden yalnızca sahip ve genel yönetim unvanları aranır.");
  if (size === "buyuk") notes.push("Büyük kurumlarda tek bir yönetici karar vermez; seçtiğiniz işlevin direktörü ve genel müdür yardımcısı öne çıkar.");
  if (!sector) {
    notes.push(`"${raw}" hazır sözlükte yok; yazdığınız sözcükten genel bir arama türetildi. Sonuçlar gelince kampanyanın Öğrenme sekmesi hangi unvanların yanıt aldığını gösterir.`);
  }

  const keywords = sector ? sector.search : uniq([raw, `${raw} şirketi`, `${raw} company`, `${raw} sanayi`, `${raw} group`].filter((x) => x.trim().length > 2));
  return {
    sectorLabel: sector?.label ?? raw,
    known: !!sector,
    companyKeywords: uniq(keywords),
    requiredCompanyKeywords: sector ? uniq(sector.must) : [],
    excludedCompanyKeywords: sector ? uniq(sector.not) : [],
    titles: uniq(titles),
    excludedTitles: UNIVERSAL_EXCLUDED_TITLES,
    notes,
  };
}

export function parseStrategyFunctions(v: string | string[] | undefined): StrategyFunction[] {
  const arr = Array.isArray(v) ? v : (v ?? "").split(",");
  return arr.map((x) => x.trim()).filter((x): x is StrategyFunction => x in FUNCTION_LABEL);
}
