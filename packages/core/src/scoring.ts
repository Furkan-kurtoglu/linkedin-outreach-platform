/**
 * Kural tabanlı kişi değerlendirme. Yapay zekâ kullanmaz, ücretsizdir ve her
 * zaman aynı sonucu verir. Emin olamadığı kişileri "belirsiz" olarak kullanıcıya sorar.
 */
import { fold, containsFolded, containsFoldedWord, matchesExcludedCompany } from "./text";
import { preferredBonus } from "./agentrules";

export interface ProspectInput {
  fullName: string;
  title?: string;
  company?: string;
  location?: string;
  industry?: string;
  /** Profil özeti / şirket açıklaması: segment ve kamu tespiti için */
  about?: string;
}

export interface SegmentRule {
  id: string;
  name: string;
  /** Kurum adında ya da açıklamada geçerse bu segmente girer */
  keywords: string[];
}

export interface Targeting {
  titles: string[];
  excludedTitles: string[];
  locations: string[];
  industries: string[];
  excludedCompanies: string[];
  /** Kurum adında geçerse elenir (ör. kamu hastaneleri) */
  excludedCompanyKeywords: string[];
  /** Kurum adında ya da açıklamada en az biri geçmeli (ör. "özel"); boşsa aranmaz */
  requiredCompanyKeywords: string[];
  segments: SegmentRule[];
  /** Tercihli ifadeler: bulunursa puan artar, bulunmaması elemez */
  preferredKeywords?: string[];
}

export type Verdict = "uygun" | "belirsiz" | "elendi";

export interface ScoreResult {
  score: number;
  verdict: Verdict;
  segmentId?: string;
  reasons: string[];
}

/** Türkiye'de kamu hastanelerini ayırt eden yaygın ifadeler. */
export const PUBLIC_HOSPITAL_KEYWORDS = [
  "eğitim ve araştırma",
  "training and research",
  "education and research",
  "devlet hastanesi",
  "state hospital",
  "şehir hastanesi",
  "city hospital",
  "il sağlık müdürlüğü",
  "sağlık bakanlığı",
  "ministry of health",
  "üniversitesi tıp fakültesi hastanesi",
];

/** Sigorta tarafında aracı kurumları ayırt eden ifadeler. */
export const INTERMEDIARY_KEYWORDS = ["acente", "acentesi", "aracılık", "broker", "brokerlik", "agency"];

const anyInWord = (text: string | undefined, list: string[]) =>
  text ? list.find((k) => containsFoldedWord(text, k)) : undefined;

const anyIn = (text: string | undefined, list: string[]) =>
  text ? list.find((k) => containsFolded(text, k)) : undefined;

/** Hekim/klinik personeli unvanları: yönetici sözcüğü yoksa karar verici sayılmaz. */
const CLINICIAN_RE = /(^|[^a-z0-9])(dr|uzm|op|prof|doc|md|ebe|nurse)([^a-z0-9]|$)|(^|[^a-z0-9])(doktor|physician|surgeon|cerrah|hemsire|dis hekimi|pratisyen|asistan|tekniker|teknisyen|technician|diyetisyen|dietisyen|dietitian|psikolog|psychologist|fizyoterapi|physiotherap|terapist|therapist|eczaci|pharmacist|laborant|radyolog|odyolog|ergoterapist|sekreter|receptionist|danisman)/
const MANAGER_RE = /(mudur|direktor|director|manager|baskan|chief|president|genel mudur|general manager|head|kurucu|founder|ceo|coo|cfo|cio|cto|cmo|owner|sahib|yonetici|bashekim|hekim basi|sef|lead|vp |partner|chair)/

/** Hastane/kurum düzeyinde üst yönetim unvanları: hedef unvan listesinde yazmasa da karar verici sayılır. */
const TOP_RE = /(hastane (mudur|direktor|baskan)|hospital (director|manager|administrator|ceo)|genel mudur|general manager|managing director|ceo|chief executive|bashekim|bas hekim|hekim basi|yonetim kurulu|kurucu|founder|owner|isletme mudur|medical director|chief medical)/
/** Kurum adından "sağlık kurumu" olduğunu anlamaya yarayan genel ifadeler. */
const HEALTH_ORG_RE = /(hastane|hospital|healthcare|health care|saglik grub|saglik hizmet|medical ?park|medikal|medical center|tip merkezi)/

/** Kurum bilinmiyorsa başlıkta bunlar geçiyorsa kişi sağlık dışı bir sektördedir. */
const NON_HEALTH_RE = /(sigorta|insurance|banka|bank\b|holding|reklam|medya|media|yazilim|software|otel|hotel|insaat|enerji|energy|lojistik|logistics|egitim|okul|school|universite|university|eczane|pharma|ilac|otomotiv|tekstil|gida)/
const GENERIC_ORG_WORDS = new Set(["ozel", "hastanesi", "hastane", "hospital", "saglik", "grubu", "group", "healthcare", "medical", "tip", "merkezi", "kliniği", "klinik", "sirketi", "a.s", "as"]);
/** Hariç kurum kuralındaki marka sözcüğü: "Acıbadem Sağlık Grubu" -> "acibadem" (Acıbadem Altunizade Hastanesi'ni de yakalar). */
function brandOf(rule: string): string | undefined {
  const w = fold(rule.split(/\s+-/)[0] ?? "").split(/[^a-z0-9]+/).filter(Boolean).find((x) => !GENERIC_ORG_WORDS.has(x));
  return w && w.length >= 5 ? w : undefined;
}

export function scoreProspect(p: ProspectInput, t: Targeting): ScoreResult {
  const reasons: string[] = [];
  const orgText = [p.company, p.about].filter(Boolean).join(" ");

  // Kesin eleme kuralları
  const brandText = fold([p.company, p.about, p.title].filter(Boolean).join(" "));
  const exCompany = t.excludedCompanies.find((c) => {
    if (p.company && matchesExcludedCompany(p.company, c)) return true;
    const b = brandOf(c);
    return !!b && new RegExp(`(^|[^a-z0-9])${b}`).test(brandText);
  });
  if (exCompany) return { score: 0, verdict: "elendi", reasons: [`Hariç tutulan kurum: ${exCompany}.`] };

  const exKeyword = anyIn(p.company, t.excludedCompanyKeywords);
  if (exKeyword) return { score: 5, verdict: "elendi", reasons: [`Kurum adında "${exKeyword}" geçiyor; kural dışı.`] };

  const exTitle = anyInWord(p.title, t.excludedTitles);
  if (exTitle) return { score: 5, verdict: "elendi", reasons: [`Hariç unvan: ${exTitle}.`] };

  const foldedTitle = fold(p.title ?? "");
  if (foldedTitle && CLINICIAN_RE.test(foldedTitle) && !MANAGER_RE.test(foldedTitle)) {
    return { score: 5, verdict: "elendi", reasons: ["Hekim/klinik personeli; karar verici yönetici değil."] };
  }

  // Yönetici/karar verici sıfatı (müdür, direktör, başkan, head, chief...) yoksa unvandaki konu (faturalama, strateji...) tek başına yetmez
  if (foldedTitle && !MANAGER_RE.test(foldedTitle)) {
    return { score: 10, verdict: "elendi", reasons: ["Unvanda yönetici sıfatı yok (müdür, direktör, başkan, head, chief...)."] };
  }

  let score = 0;

  // Unvan (en fazla 45 puan)
  const titleHit = anyInWord(p.title, t.titles) ?? (TOP_RE.test(foldedTitle) ? "üst yönetim unvanı" : undefined);
  if (titleHit) {
    score += 45;
    reasons.push(`Unvanda "${titleHit}" geçiyor.`);
  } else if (t.titles.length) {
    reasons.push("Unvan hedef listesinde yok.");
  }

  // Konum (15)
  if (!t.locations.length) score += 15;
  else if (anyIn(p.location, t.locations)) score += 15;
  else if (!p.location) reasons.push("Konum bilinmiyor.");
  else reasons.push(`Konum hedef dışında: ${p.location}.`);

  // Sektör (15)
  if (!t.industries.length || anyIn(p.industry, t.industries)) score += 15;
  else if (p.industry) reasons.push(`Sektör hedef dışında: ${p.industry}.`);

  // Zorunlu kurum ifadesi, ör. "özel" (15)
  let requiredOk = true;
  if (t.requiredCompanyKeywords.length) {
    const hit = anyIn(orgText, t.requiredCompanyKeywords);
    if (hit) {
      score += 15;
      reasons.push(`Kurum bilgisinde "${hit}" geçiyor.`);
    } else if (HEALTH_ORG_RE.test(fold(orgText)) && t.requiredCompanyKeywords.some((k) => HEALTH_ORG_RE.test(fold(k)))) {
      score += 10;
      reasons.push("Kurum bir sağlık kuruluşu görünüyor.");
    } else {
      requiredOk = false;
      reasons.push("Kurumun özel/uygun olduğu doğrulanamadı.");
    }
  } else score += 15;

  // Segment (10)
  const segment = t.segments.find((s) => anyIn(orgText, s.keywords));
  if (segment) {
    score += 10;
    reasons.push(`Segment: ${segment.name}.`);
  }

  // Tercihli ölçüt (en fazla +10)
  if (t.preferredKeywords?.length) {
    const pb = preferredBonus(t.preferredKeywords, p.title, p.company, p.about);
    if (pb.bonus) {
      score += pb.bonus;
      reasons.push(`Tercih edilen ölçüt: ${pb.hits.join(", ")}.`);
    }
  }

  // Kurum bilgisi yok ya da sektör dışı: kişi hedef dışındadır, karar listesine bile girmez
  // Kurum alanı boşsa (LinkedIn başlığından ayrıştırılamadıysa) üst düzey unvanlı kişi elenmez; "belirsiz" kalır ve elle karar verilir
  const noCompany = !p.company?.trim();
  if (t.requiredCompanyKeywords.length && !requiredOk && !noCompany) {
    return { score: Math.min(30, score), verdict: "elendi", reasons: [...reasons, p.company ? "Kurum hedef sektör dışında." : "Kurum bilgisi yok; hedef dışı sayıldı."] };
  }

  // Kurum bilinmiyor ve başlıkta sağlık kurumu belirtisi de yok: sağlık dışı sektör işareti varsa elenir, yoksa düşük puanla "belirsiz" kalır (ziyarette doğrulanır)
  if (noCompany && !requiredOk) {
    if (NON_HEALTH_RE.test(fold([orgText, p.title].filter(Boolean).join(" ")))) {
      return { score: Math.min(20, score), verdict: "elendi", reasons: [...reasons, "Başlıkta sağlık dışı sektör işareti var; kurum bilinmiyor."] };
    }
    return { score: Math.min(25, score), verdict: "belirsiz", reasons: [...reasons, "Kurum bilgisi yok; profil ziyaretinde Deneyim bölümünden doğrulanacak."] };
  }

  // Karar
  let verdict: Verdict;
  if (!titleHit) {
    // Yönetici sıfatlı ama hedef unvan listesinde olmayan kişi: kurum uygunsa elenmez, elle karar için "belirsiz" kalır
    if (requiredOk) return { score: Math.min(50, score), verdict: "belirsiz", reasons: [...reasons, "Yönetici ama hedef unvan listesinde yok; elle karar verin."] };
    // Kurum bilinmiyorsa profil ziyaretinde Deneyim bölümünden tamamlanır; şimdilik elenmez
    if (noCompany) return { score: Math.min(25, score), verdict: "belirsiz", reasons: [...reasons, "Kurum bilgisi yok; profil ziyaretinde Deneyim bölümünden doğrulanacak."] };
    return { score: Math.min(35, score), verdict: "elendi", reasons: [...reasons, "Hedef unvan listesinde yok; listeye alınmadı."] };
  }
  else if (!requiredOk || !segment) verdict = "belirsiz";
  else verdict = score >= 75 ? "uygun" : "belirsiz";

  return { score: Math.min(100, score), verdict, segmentId: segment?.id, reasons };
}
