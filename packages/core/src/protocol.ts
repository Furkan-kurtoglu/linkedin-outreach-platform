/**
 * Panel ile yerel çalışan arasındaki sözleşme. Çalışan veritabanına doğrudan bağlanmaz;
 * yalnızca kendi anahtarıyla panelden iş ister ve sonucunu bildirir.
 */

export type JobType =
  | "VISIT_PROFILE"
  | "SEND_INVITE"
  | "SEND_MESSAGE"
  | "SEND_INMAIL"
  | "WITHDRAW_INVITE"
  | "CHECK_CONNECTIONS"
  | "CHECK_INBOX"
  | "SYNC_SENT_INVITES"
  | "DISCOVER";

export interface DiscoverStepPayload {
  source: "connections" | "accounts" | "search" | "engagers" | "import";
  label: string;
  url: string;
  maxPages: number;
}

/** Panelin kendi kaydı için: hangi adım ve şablon (çalışan kullanmaz) */
export interface StepRef {
  stepId?: string;
  templateId?: string;
}

export type JobPayload =
  | {
      type: "VISIT_PROFILE";
      profileUrl: string;
      /** Kişiye özel ilk cümle için son paylaşımı oku (yalnızca seçenek açıksa) */
      readPost?: boolean;
      /** Ortak okul için eğitim bilgisini oku (yalnızca seçenek açıksa) */
      readEducation?: boolean;
    }
  | ({ type: "SEND_INVITE"; profileUrl: string; note?: string } & StepRef)
  | ({ type: "SEND_MESSAGE"; profileUrl: string; text: string; attachment?: { fileId: string; name: string }; viaOpenProfile?: boolean } & StepRef)
  | ({ type: "SEND_INMAIL"; profileUrl: string; subject: string; text: string } & StepRef)
  | { type: "WITHDRAW_INVITE"; profileUrl: string }
  | { type: "CHECK_CONNECTIONS"; limit: number }
  | { type: "CHECK_INBOX"; limit: number }
  | { type: "SYNC_SENT_INVITES" }
  | { type: "DISCOVER"; agentId: string; steps: DiscoverStepPayload[]; viewBudget: number };

export interface RunnerJob {
  id: string;
  payload: JobPayload;
}

/* ---------- Sonuçlar ---------- */

export interface VisitData {
  degree?: 1 | 2 | 3;
  openProfile?: boolean;
  fullName?: string;
  headline?: string;
  title?: string;
  company?: string;
  location?: string;
  about?: string;
  /** Profilde görünen ortak bağlantılardan ilki */
  mutualName?: string;
  mutualConnections?: number;
  sharedSchool?: string;
  /** Son paylaşımın metni: panel yalnızca konusunu çıkarıp saklar */
  recentPostText?: string;
  /** Davet zaten gönderilmiş ve bekliyor */
  invitePending?: boolean;
}

export interface InviteData {
  status: "sent" | "already_connected" | "already_pending";
}

export interface ConnectionsData {
  /** Son eklenen bağlantılar, en yeni önce */
  profileUrls: string[];
}

export interface InboxMessage {
  fromMe: boolean;
  text: string;
  /** ISO tarih; okunamazsa çalışanın gördüğü an */
  at: string;
}

export interface InboxThread {
  profileUrl: string;
  fullName?: string;
  messages: InboxMessage[];
}

export interface InboxData {
  threads: InboxThread[];
}

export interface SentInvitesData {
  invites: { profileUrl: string; sentAt: string }[];
}

export interface DiscoverCandidate {
  profileUrl: string;
  fullName: string;
  headline?: string;
  title?: string;
  company?: string;
  location?: string;
  degree?: 1 | 2 | 3;
  mutualConnections?: number;
  source: DiscoverStepPayload["source"];
}

export interface DiscoverData {
  candidates: DiscoverCandidate[];
  viewed: number;
  /** Adım bazında rapor: panelde "Tarama geçmişi" */
  steps: { label: string; viewed: number; found: number }[];
}

export interface InmailData {
  creditsLeft?: number;
}

export type ErrorCode =
  /** LinkedIn oturumu kapandı; kullanıcı yeniden giriş yapmalı */
  | "session_expired"
  /** LinkedIn doğrulama/uyarı gösterdi; hesap 24 saat duraklatılır */
  | "linkedin_warning"
  /** Haftalık davet sınırı uyarısı */
  | "invite_limit"
  /** Profil bulunamadı ya da kaldırılmış */
  | "not_found"
  /** Bu kişiye mesaj/davet gönderilemiyor (ör. davet düğmesi yok, mesaj kapalı) */
  | "cannot_message"
  /** Geçici hata: yeniden denenir */
  | "transient";

export type JobResult =
  | {
      ok: true;
      data?: VisitData | InviteData | ConnectionsData | InboxData | SentInvitesData | DiscoverData | InmailData;
    }
  | { ok: false; error: ErrorCode; message?: string };

export interface PollResponse {
  job: RunnerJob | null;
  /** İş yoksa kaç saniye sonra tekrar sorulsun */
  sleepSec: number;
  account: { status: string; pausedUntil: string | null };
}

/** Başlığı "Unvan at Kurum" / "Kurum'da Unvan" / "Unvan | Kurum" biçimlerinden ayırır. */
export function splitHeadline(headline: string | undefined): { title?: string; company?: string } {
  const h = headline?.trim();
  if (!h) return {};
  const at = h.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
  if (at) return { title: at[1]!.trim(), company: at[2]!.split(/\s+[|·•-]\s+/)[0]!.trim() };
  const tr = h.match(/^(.+?)['’]n?(?:da|de|ta|te)\s+(.+)$/i);
  if (tr) return { company: tr[1]!.trim(), title: tr[2]!.split(/\s+[|·•-]\s+/)[0]!.trim() };
  const parts = h.split(/\s+[|·•]\s+|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { title: parts[0], company: parts[1] };
  return { title: h };
}
