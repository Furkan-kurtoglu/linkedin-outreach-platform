/**
 * Profil doğrulaması: arama kartındaki başlık yerine kişinin profilindeki GÜNCEL pozisyonlar
 * (unvan + kurum + görev tanımı) değerlendirilir. Kart yalnızca bir ipucudur; karar profile göre verilir.
 */
import { fold } from "./text";
import { scoreProspect, type ProspectInput, type ScoreResult, type Targeting, type Verdict } from "./scoring";

export interface Position {
  title?: string;
  company?: string;
  /** Bitiş tarihi yok / "Günümüz" */
  current: boolean;
  /** Görev tanımının başı */
  description?: string;
}

/** Görev tanımı hasta, gelir ve kurum anlaşmaları işleriyle ilgili mi (puanı artırır, tek başına geçirmez). */
const DESC_RE = /(hasta kabul|hasta hizmet|hasta deneyim|hasta hak|hasta iliski|provizyon|sgk|anlasmali|sigorta|fatura|gelir|tahsilat|hakedis|sozlesme|contracting|patient|revenue|reimburse|billing|admission|hastane yonetim|hospital management|operasyon)/;

const RANK: Record<Verdict, number> = { uygun: 2, belirsiz: 1, elendi: 0 };

/** İsim kartta başlık yerine tekrar etmişse ya da "profilini görüntüle" gibi bir çöpse gerçek başlık yok demektir. */
export function hasRealHeadline(headline: string | undefined, fullName: string): boolean {
  const h = fold(headline ?? "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (h.length < 4) return false;
  const n = fold(fullName).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!n) return true;
  if (h === n || h === `${n} ${n}`) return false;
  if (h.replaceAll(n, "").trim().length < 4) return false;
  if (/(profilini goruntule|view .*profile)/.test(h)) return false;
  return true;
}

/**
 * Kart aşamasında elenen ama yalnızca KURUM/ÖZET bilgisi eksik olduğu için elenen kişiyi bulur:
 * kurum "özel hastane" varsayıldığında elenmeyecekse profil ziyaretiyle doğrulanır, aksi halde kesin elenir.
 * Dönen metin doluysa kişi "doğrulanacak" havuzuna girer.
 */
export function verifyReason(p: ProspectInput, hasHeadline: boolean, score: ScoreResult, t: Targeting): string | undefined {
  if (score.verdict !== "elendi") return undefined;
  const last = score.reasons[score.reasons.length - 1] ?? "";
  // Kesin eleme nedenleri doğrulamaya gitmez
  if (/(Hariç|Klinik|Hekim|Konum hedef|sağlık dışı|üniversite, kamu|Sigorta şirketi)/.test(last)) return undefined;
  const ft = fold(p.title ?? "");
  // Yalnızca "Founder/Kurucu" yazan binlerce kişi var; doğrulama bütçesi buna harcanmaz
  if (/(kurucu|founder|owner|sahib)/.test(ft) && !/(mudur|direktor|director|manager|baskan|ceo|general|yonetici)/.test(ft)) return undefined;
  if (!hasHeadline) return "Kartta unvan okunamadı; profilden okunacak.";
  const counter = scoreProspect({ ...p, company: undefined, about: `${p.about ?? ""} Özel Hastanesi` }, { ...t, excludedCompanyKeywords: [] });
  if (counter.verdict !== "elendi" && /(Kurum bilinmiyor|Kurumun özel|Hedef unvan)/.test(last)) return "Kurum kartta anlaşılmadı; profilden doğrulanacak.";
  return undefined;
}

/**
 * Güncel pozisyonlara göre karar verir. Her güncel pozisyon ayrı ayrı (unvan + kurum) puanlanır, en iyisi seçilir.
 * Güncel pozisyon yoksa profildeki başlıktan puanlanır (kimse işten ayrıldığını başlığa yazmaz; belirsiz kalır).
 */
export function scoreProfile(
  input: { fullName: string; headline?: string; location?: string; positions: Position[] },
  t: Targeting,
): ScoreResult & { position?: Position } {
  const current = input.positions.filter((x) => x.current && (x.title || x.company));
  if (!current.length) {
    const r = scoreProspect({ fullName: input.fullName, title: input.headline, location: input.location, about: input.headline }, t);
    return { ...r, reasons: [...r.reasons, "Profilde güncel pozisyon okunamadı."] };
  }
  let best: (ScoreResult & { position: Position }) | undefined;
  for (const pos of current) {
    const r = scoreProspect({ fullName: input.fullName, title: pos.title, company: pos.company, location: input.location }, t);
    const descHit = pos.description && DESC_RE.test(fold(pos.description));
    const out: ScoreResult = { ...r };
    if (r.verdict !== "elendi" && descHit) {
      out.score = Math.min(100, r.score + 5);
      out.reasons = [...r.reasons, "Görev tanımı hasta/gelir yönetimiyle ilgili."];
    }
    out.reasons = [`Güncel görev: ${pos.title ?? "?"} @ ${pos.company ?? "?"}.`, ...out.reasons];
    const cand = { ...out, position: pos };
    if (!best || RANK[cand.verdict] > RANK[best.verdict] || (RANK[cand.verdict] === RANK[best.verdict] && cand.score > best.score)) best = cand;
  }
  return best!;
}
