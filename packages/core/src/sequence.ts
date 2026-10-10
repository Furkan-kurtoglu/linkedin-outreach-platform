/**
 * Akış motoru: her kişi için sıradaki adımı belirler.
 *
 * İki kol vardır:
 *  - Yeni kişi (2./3. derece): [profil ziyareti] -> davet notu -> kabulde detay mesajı -> takipler
 *  - Mevcut bağlantı (1. derece): davet yok -> doğrudan "bağlantı mesajı" -> takipler
 *
 * Her mesaj adımına belge eklenebilir (ör. tek sayfalık tanıtım PDF'i). Davet notuna
 * LinkedIn belge eklemeye izin vermez; bu yüzden belge yalnızca mesaj adımlarında seçilebilir.
 */

export type StepType = "visit" | "invite" | "accepted_message" | "connected_message" | "open_message" | "inmail" | "follow_up";

export interface Attachment {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SequenceStep {
  id: string;
  type: StepType;
  /** Önceki adımdan sonra beklenecek saat (kabulde mesaj için 0) */
  delayHours: number;
  attachment?: Attachment;
}

export interface Sequence {
  /** Davetten önce profil ziyareti yapılsın mı (karşı tarafa bildirim gider, tanıdıklık sağlar) */
  visitBeforeInvite: boolean;
  newPersonSteps: SequenceStep[];
  connectedSteps: SequenceStep[];
  /** Kabul edilmeyen davet kaç gün sonra geri çekilsin */
  withdrawAfterDays: number;
  /**
   * Seçenek: açık profil (Open Profile) olan 2./3. derece kişilere davet yerine doğrudan,
   * ücretsiz mesaj. Kapalıysa bu kişiler de normal davet akışına girer.
   */
  openProfile?: { enabled: boolean; step: SequenceStep };
  /**
   * Seçenek: davet kabul edilmeyip geri çekildiğinde, uygunluk puanı yüksekse InMail gönder.
   * Premium hesapların aylık InMail hakkı sınırlıdır.
   */
  inmail?: { enabled: boolean; minFitScore: number; step: SequenceStep };
}

export interface ProspectState {
  degree: 1 | 2 | 3;
  visitedAt?: Date;
  invitedAt?: Date;
  acceptedAt?: Date;
  repliedAt?: Date;
  withdrawnAt?: Date;
  /** Gönderilen mesaj adımlarının id'leri ve zamanları, sırayla */
  sent: { stepId: string; at: Date }[];
  suppressed?: boolean;
  /** Kişi LinkedIn'de açık profil mi (bağlantı olmadan ücretsiz mesaj alabilir) */
  openProfile?: boolean;
  fitScore?: number;
  /** Hesapta bu ay kalan InMail hakkı */
  inmailCreditsLeft?: number;
}

export type NextAction =
  | { kind: "wait"; until: Date; reason: string }
  | { kind: "visit" }
  | { kind: "invite"; stepId: string }
  | { kind: "message"; stepId: string; attachment?: Attachment }
  | { kind: "inmail"; stepId: string; attachment?: Attachment }
  | { kind: "withdraw"; reason: string }
  | { kind: "done"; reason: string };

/** Belge sınırları: LinkedIn mesajında güvenli tarafta kalmak için. */
export const ATTACHMENT_RULES = {
  maxBytes: 10 * 1024 * 1024,
  allowed: ["application/pdf"],
};

export function validateAttachment(a: Attachment): string | null {
  if (!ATTACHMENT_RULES.allowed.includes(a.mimeType)) return "Yalnızca PDF eklenebilir.";
  if (a.sizeBytes > ATTACHMENT_RULES.maxBytes) return "Belge 10 MB'den büyük olamaz.";
  return null;
}

export function validateSequence(s: Sequence): string[] {
  const errs: string[] = [];
  const firstNew = s.newPersonSteps[0];
  if (!firstNew || firstNew.type !== "invite") errs.push("Yeni kişi akışı davet notuyla başlamalı.");
  if (s.newPersonSteps.some((x) => x.type === "invite" && x.attachment)) errs.push("Davet notuna belge eklenemez.");
  const acc = s.newPersonSteps[1];
  if (acc && acc.type !== "accepted_message") errs.push("Davetten sonraki adım kabulde gidecek mesaj olmalı.");
  const firstConn = s.connectedSteps[0];
  if (!firstConn || firstConn.type !== "connected_message") errs.push("Mevcut bağlantı akışı bir mesajla başlamalı.");
  for (const step of [...s.newPersonSteps, ...s.connectedSteps]) {
    if (step.attachment) {
      const e = validateAttachment(step.attachment);
      if (e) errs.push(e);
    }
  }
  if (s.withdrawAfterDays < 7) errs.push("Bekleyen davetler en erken 7 gün sonra geri çekilmeli.");
  for (const extra of [s.openProfile?.step, s.inmail?.step]) {
    if (extra?.attachment) {
      const e = validateAttachment(extra.attachment);
      if (e) errs.push(e);
    }
  }
  if (s.inmail?.enabled && (s.inmail.minFitScore < 0 || s.inmail.minFitScore > 100)) errs.push("InMail için puan eşiği 0-100 arası olmalı.");
  return errs;
}

const H = 3_600_000;
const D = 24 * H;

export function nextAction(s: Sequence, p: ProspectState, now: Date): NextAction {
  if (p.suppressed) return { kind: "done", reason: "Kişi listeden çıkarıldı." };
  if (p.repliedAt) return { kind: "done", reason: "Cevap verdi; konuşma gelen kutusunda." };
  const sentIds = new Set(p.sent.map((x) => x.stepId));

  if (p.withdrawnAt) {
    const im = s.inmail;
    if (im?.enabled && !sentIds.has(im.step.id) && (p.fitScore ?? 0) >= im.minFitScore && (p.inmailCreditsLeft ?? 0) > 0) {
      return { kind: "inmail", stepId: im.step.id, attachment: im.step.attachment };
    }
    return { kind: "done", reason: "Davet kabul edilmedi, geri çekildi." };
  }

  // Açık profil: davet yerine doğrudan ücretsiz mesaj, ardından mevcut bağlantı takipleri
  const op = s.openProfile;
  if (op?.enabled && p.openProfile && p.degree !== 1 && !p.invitedAt && !p.acceptedAt) {
    const steps = [op.step, ...s.connectedSteps.slice(1)];
    const next = steps.find((x) => !sentIds.has(x.id));
    if (!next) return { kind: "done", reason: "Açık profil akışı tamamlandı." };
    const last = p.sent.at(-1);
    const due = last ? new Date(last.at.getTime() + next.delayHours * H) : now;
    if (due.getTime() > now.getTime()) return { kind: "wait", until: due, reason: "Bir sonraki adımın zamanı bekleniyor." };
    return { kind: "message", stepId: next.id, attachment: next.attachment };
  }

  const connected = p.degree === 1 || !!p.acceptedAt;
  const steps = p.degree === 1 ? s.connectedSteps : s.newPersonSteps;

  if (!connected) {
    if (!p.invitedAt) {
      if (s.visitBeforeInvite && !p.visitedAt) return { kind: "visit" };
      if (s.visitBeforeInvite && p.visitedAt && now.getTime() - p.visitedAt.getTime() < 12 * H) {
        return { kind: "wait", until: new Date(p.visitedAt.getTime() + 12 * H), reason: "Profil ziyaretinden sonra bekleniyor." };
      }
      return { kind: "invite", stepId: steps[0]!.id };
    }
    if (now.getTime() - p.invitedAt.getTime() >= s.withdrawAfterDays * D) {
      return { kind: "withdraw", reason: `${s.withdrawAfterDays} gündür kabul edilmedi.` };
    }
    return { kind: "wait", until: new Date(p.invitedAt.getTime() + s.withdrawAfterDays * D), reason: "Davetin kabul edilmesi bekleniyor." };
  }

  // Bağlı: davet dışındaki mesaj adımlarını sırayla gönder
  const messageSteps = steps.filter((x) => x.type !== "invite" && x.type !== "visit");
  const next = messageSteps.find((x) => !sentIds.has(x.id));
  if (!next) return { kind: "done", reason: "Akış tamamlandı." };

  const last = p.sent.at(-1);
  const anchor = last ? last.at : p.acceptedAt ?? now;
  const due = new Date(anchor.getTime() + next.delayHours * H);
  if (due.getTime() > now.getTime()) return { kind: "wait", until: due, reason: "Bir sonraki adımın zamanı bekleniyor." };
  return { kind: "message", stepId: next.id, attachment: next.attachment };
}

/** Önerilen varsayılan akış. */
export function defaultSequence(): Sequence {
  return {
    visitBeforeInvite: true,
    withdrawAfterDays: 21,
    newPersonSteps: [
      { id: "invite", type: "invite", delayHours: 0 },
      { id: "accepted", type: "accepted_message", delayHours: 0 },
      { id: "fu1", type: "follow_up", delayHours: 4 * 24 },
      { id: "fu2", type: "follow_up", delayHours: 6 * 24 },
    ],
    connectedSteps: [
      { id: "conn", type: "connected_message", delayHours: 0 },
      { id: "cfu1", type: "follow_up", delayHours: 5 * 24 },
    ],
    openProfile: { enabled: false, step: { id: "open", type: "open_message", delayHours: 0 } },
    inmail: { enabled: false, minFitScore: 80, step: { id: "inmail", type: "inmail", delayHours: 0 } },
  };
}

/* ---------- Gönderim günleri ---------- */

/** Türkiye'de tarihi sabit resmî tatiller (ay-gün). Dinî bayramlar her yıl panelden eklenir. */
export const FIXED_HOLIDAYS_TR = ["01-01", "04-23", "05-01", "05-19", "07-15", "08-30", "10-29"];

/** Verilen yerel tarih gönderim yapılmayacak bir gün mü? */
export function isQuietDay(localDate: Date, extraHolidays: string[] = []): boolean {
  const md = `${String(localDate.getUTCMonth() + 1).padStart(2, "0")}-${String(localDate.getUTCDate()).padStart(2, "0")}`;
  const ymd = `${localDate.getUTCFullYear()}-${md}`;
  return FIXED_HOLIDAYS_TR.includes(md) || extraHolidays.includes(ymd);
}
