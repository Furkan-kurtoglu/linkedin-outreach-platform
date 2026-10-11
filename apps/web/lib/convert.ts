/**
 * Veritabanı kayıtlarını çekirdek motorun tiplerine çevirir. Motor saf TypeScript'tir;
 * veritabanını bilmez. Bütün kararlar (zamanlama, akış, puanlama) motorda verilir.
 */
import {
  DEFAULT_SCHEDULE,
  type DaySchedule,
  type PersonalizationOptions,
  type ScheduleConfig,
  type Sequence,
  type SequenceStep as CoreStep,
  type Targeting,
  type TemplateRules,
} from "@hfo/core";
import type { Agent, LinkedinAccount, Segment, SequenceStep, Workspace } from "@hfo/db";

/* ---------- Hedefleme ---------- */

export interface TargetingJson {
  titles: string[];
  excludedTitles: string[];
  locations: string[];
  industries: string[];
  requiredCompanyKeywords: string[];
  excludedCompanyKeywords: string[];
  /** LinkedIn konum ve sektör kimlikleri (çalışan aramada çözer; boşsa metinle aranır) */
  geoUrns: string[];
  industryIds: string[];
  engagementPostUrls: string[];
}

export const EMPTY_TARGETING: TargetingJson = {
  titles: [],
  excludedTitles: [],
  locations: [],
  industries: [],
  requiredCompanyKeywords: [],
  excludedCompanyKeywords: [],
  geoUrns: [],
  industryIds: [],
  engagementPostUrls: [],
};

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function readTargeting(json: unknown): TargetingJson {
  const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  return {
    titles: strArr(o.titles),
    excludedTitles: strArr(o.excludedTitles),
    locations: strArr(o.locations),
    industries: strArr(o.industries),
    requiredCompanyKeywords: strArr(o.requiredCompanyKeywords),
    excludedCompanyKeywords: strArr(o.excludedCompanyKeywords),
    geoUrns: strArr(o.geoUrns),
    industryIds: strArr(o.industryIds),
    engagementPostUrls: strArr(o.engagementPostUrls),
  };
}

export const segmentKeywords = (s: Pick<Segment, "matchRule">) =>
  (s.matchRule ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function toTargeting(agent: Agent, segments: Segment[], excludedCompanies: string[]): Targeting {
  const t = readTargeting(agent.targeting);
  return {
    titles: t.titles,
    excludedTitles: t.excludedTitles,
    locations: t.locations,
    industries: t.industries,
    excludedCompanies,
    excludedCompanyKeywords: t.excludedCompanyKeywords,
    requiredCompanyKeywords: t.requiredCompanyKeywords,
    segments: segments.map((s) => ({ id: s.id, name: s.name, keywords: segmentKeywords(s) })),
    preferredKeywords: agent.preferredKeywords,
  };
}

/* ---------- Kurallar ---------- */

export function toRules(agent: Agent, ws: Workspace, account: LinkedinAccount, excludedCompanies: string[]): TemplateRules {
  return {
    bannedPhrases: [...new Set([...ws.bannedPhrases, ...agent.bannedPhrases])],
    excludedCompanies,
    requiredLink: agent.requiredLink ?? undefined,
    premium: account.premium,
  };
}

/* ---------- Zamanlama ---------- */

export interface ScheduleJson {
  days: DaySchedule[];
  minGapMin?: number;
  maxGapMin?: number;
}

function readDay(v: unknown): DaySchedule | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const windows = Array.isArray(o.windows)
    ? o.windows
        .map((w) => (w && typeof w === "object" ? (w as Record<string, unknown>) : null))
        .filter((w): w is Record<string, unknown> => !!w && typeof w.startMin === "number" && typeof w.endMin === "number")
        .map((w) => ({ startMin: w.startMin as number, endMin: w.endMin as number }))
    : [];
  return { enabled: o.enabled === true, windows, invites: typeof o.invites === "number" ? o.invites : undefined };
}

export function toScheduleConfig(acc: LinkedinAccount): ScheduleConfig {
  const base: ScheduleConfig = {
    ...DEFAULT_SCHEDULE,
    weeklyInvites: acc.weeklyInvites,
    activeDays: acc.activeDays,
    windowStartMin: acc.windowStartMin,
    windowEndMin: acc.windowEndMin,
  };
  const s = acc.schedule as unknown;
  if (s && typeof s === "object" && Array.isArray((s as ScheduleJson).days)) {
    const sj = s as ScheduleJson;
    const days = sj.days.map(readDay);
    if (days.length === 7 && days.every((d): d is DaySchedule => !!d)) {
      return {
        ...base,
        days,
        minGapMin: typeof sj.minGapMin === "number" ? sj.minGapMin : base.minGapMin,
        maxGapMin: typeof sj.maxGapMin === "number" ? sj.maxGapMin : base.maxGapMin,
      };
    }
  }
  return base;
}

/* ---------- Akış ---------- */

const STEP_TYPE: Record<SequenceStep["type"], CoreStep["type"]> = {
  VISIT: "visit",
  INVITE: "invite",
  ACCEPTED_MESSAGE: "accepted_message",
  CONNECTED_MESSAGE: "connected_message",
  FOLLOW_UP: "follow_up",
  OPEN_MESSAGE: "open_message",
  INMAIL: "inmail",
};

const toCore = (s: SequenceStep): CoreStep => ({ id: s.id, type: STEP_TYPE[s.type], delayHours: s.delayHours });

export function toSequence(agent: Agent, steps: SequenceStep[]): Sequence {
  const sorted = [...steps].sort((a, b) => a.order - b.order);
  const newPerson = sorted.filter((s) => s.branch === "NEW_PERSON" && s.type !== "OPEN_MESSAGE" && s.type !== "INMAIL" && s.type !== "VISIT");
  const connected = sorted.filter((s) => s.branch === "CONNECTED");
  const open = sorted.find((s) => s.type === "OPEN_MESSAGE");
  const inmail = sorted.find((s) => s.type === "INMAIL");
  return {
    visitBeforeInvite: agent.visitBeforeInvite,
    withdrawAfterDays: agent.withdrawAfterDays,
    newPersonSteps: newPerson.map(toCore),
    connectedSteps: connected.map(toCore),
    openProfile: open ? { enabled: agent.openProfileEnabled, step: toCore(open) } : undefined,
    inmail: inmail ? { enabled: agent.inmailEnabled, minFitScore: agent.inmailMinFitScore, step: toCore(inmail) } : undefined,
  };
}

/* ---------- Kişiselleştirme ---------- */

const SOURCES = ["mutual", "post", "school", "city"] as const;

export function toPersonalization(agent: Agent): PersonalizationOptions {
  return {
    firstLine: {
      enabled: agent.firstLineEnabled,
      sources: agent.firstLineSources.filter((s): s is (typeof SOURCES)[number] => (SOURCES as readonly string[]).includes(s)),
    },
    calendar: { enabled: agent.calendarEnabled, url: agent.calendarUrl ?? undefined },
    english: { enabled: agent.englishEnabled },
  };
}

/* ---------- Etiketler ---------- */

export const STEP_LABEL: Record<SequenceStep["type"], string> = {
  VISIT: "Profil ziyareti",
  INVITE: "Davet notu",
  ACCEPTED_MESSAGE: "Kabulde mesaj",
  CONNECTED_MESSAGE: "Bağlantıya ilk mesaj",
  FOLLOW_UP: "Takip",
  OPEN_MESSAGE: "Açık profile mesaj",
  INMAIL: "InMail",
};

export const STAGE_LABEL: Record<string, { text: string; tone: string }> = {
  QUEUED: { text: "Sırada", tone: "t-mute" },
  NEEDS_REVIEW: { text: "Belirsiz", tone: "t-warn" },
  INVITE_SENT: { text: "Davet gitti", tone: "t-mute" },
  CONNECTED: { text: "Bağlandı", tone: "t-info" },
  MESSAGED: { text: "Mesaj gitti", tone: "t-info" },
  INMAIL_SENT: { text: "InMail gitti", tone: "t-info" },
  REPLIED: { text: "Cevap verdi", tone: "t-good" },
  WITHDRAWN: { text: "Davet geri çekildi", tone: "t-mute" },
  FINISHED: { text: "Akış bitti", tone: "t-mute" },
  SKIPPED: { text: "Atlandı", tone: "t-mute" },
};

export const REPLY_LABEL: Record<string, { text: string; tone: string }> = {
  INTERESTED: { text: "İlgileniyor", tone: "t-good" },
  LATER: { text: "Sonra", tone: "t-warn" },
  NOT_INTERESTED: { text: "İlgilenmiyor", tone: "t-bad" },
  WRONG_PERSON: { text: "Yanlış kişi", tone: "t-mute" },
  OTHER: { text: "Diğer", tone: "t-mute" },
};

export const OPP_STAGES = [
  ["NEW", "Görüşme istedi"],
  ["MEETING_SET", "Görüşme planlandı"],
  ["PROPOSAL", "Pilot görüşmesi"],
  ["WON", "Kazanıldı"],
  ["LOST", "Kaybedildi"],
] as const;
