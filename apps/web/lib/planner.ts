import "server-only";
/**
 * Planlayıcı: bir LinkedIn hesabı için sıradaki işleri kuyruğa koyar.
 *
 * Zamanlanmış görev (cron) gerektirmez: yerel çalışan her iş istediğinde en fazla
 * 2 dakikada bir çalışır. Bilgisayar kapalıyken hiçbir şey planlanmaz; açılınca kaldığı
 * yerden devam eder. Bütün kararlar çekirdek motorda verilir (akış, zamanlama, bütçe).
 */
import {
  PRIORITY,
  allocateInvites,
  hasWindow,
  restrictToWindow,
  chooseLanguage,
  chunkDiscoverySteps,
  fold,
  dispatchTime,
  invitesRemainingToday,
  messagesRemainingToday,
  nextAction,
  nextOpenSlot,
  optionalValues,
  pickMessagesForToday,
  planDiscovery,
  planInviteTimes,
  profileViewBudget,
  renderForPerson,
  salutationFor,
  throttleByCompany,
  warmupBudget,
  type AgentWindow,
  type DispatchKind,
  type JobPayload,
  type ProspectState,
  type Salutation,
} from "@hfo/core";
import { prisma, Prisma, type Agent, type AgentProspect, type JobType, type LinkedinAccount, type Prospect, type ReviewMode, type SequenceStep, type Template, type Workspace } from "@hfo/db";
import { readTargeting, toPersonalization, toRules, toScheduleConfig, toSequence } from "./convert";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const PLAN_EVERY_MS = 2 * MIN;
const CHECK_EVERY_MS = 10 * MIN;

/** Akışın sürdüğü aşamalar (geri çekilen davetler yalnızca InMail seçeneği açıkken ayrıca bakılır) */
const ACTIVE_STAGES = ["QUEUED", "INVITE_SENT", "CONNECTED", "MESSAGED", "INMAIL_SENT"] as const;
const OPEN_JOB = ["PENDING", "AWAITING_APPROVAL", "RUNNING"] as const;

interface LocalDay {
  /** 0=Pazar */
  weekday: number;
  startUtc: Date;
  endUtc: Date;
}

export function localDay(now: Date, utcOffsetMin: number): LocalDay {
  const off = utcOffsetMin * MIN;
  const local = new Date(now.getTime() + off);
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - off;
  return { weekday: local.getUTCDay(), startUtc: new Date(start), endUtc: new Date(start + DAY) };
}

/** Deterministik küçük özet: A/B varyantını kişiye sabitlemek için */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Kampanyanın kendi gönderim penceresi; yoksa null (hesap takvimi geçerli). */
export function windowOf(a: Pick<Agent, "windowDays" | "windowStartMin" | "windowEndMin">): AgentWindow | null {
  const w = { days: a.windowDays, startMin: a.windowStartMin ?? undefined, endMin: a.windowEndMin ?? undefined };
  return hasWindow(w) ? w : null;
}

/** Adım + segment + dil için onaylı şablon; A/B varyantları arasında kişiye sabit seçim. */
export function pickTemplate(tpls: Template[], stepId: string, segmentId: string | null, lang: string, personKey: string): Template | undefined {
  const forStep = tpls.filter((t) => t.stepId === stepId && t.status === "APPROVED");
  const pool = (l: string) => {
    const seg = forStep.filter((t) => t.segmentId === segmentId && t.lang === l);
    return seg.length ? seg : forStep.filter((t) => t.segmentId === null && t.lang === l);
  };
  const list = pool(lang).length ? pool(lang) : pool("tr");
  if (!list.length) return undefined;
  const sorted = [...list].sort((a, b) => a.variant.localeCompare(b.variant));
  return sorted[hash(personKey) % sorted.length];
}

function answersSalutation(agent: Agent): Salutation {
  const a = agent.answers as { salutation?: unknown } | null;
  return a?.salutation === "bey_hanim" ? "bey_hanim" : "ad_soyad";
}

export interface RenderedText {
  text: string;
  ok: boolean;
  issues: string[];
  templateId?: string;
  lang: string;
}

/** Bir kişi ve adım için metni hazırlar; kural denetiminden geçmezse ok=false (gönderilmez). */
export function renderStep(args: {
  agent: Agent;
  ws: Workspace;
  account: LinkedinAccount;
  excludedCompanies: string[];
  step: SequenceStep;
  templates: Template[];
  ap: AgentProspect;
  prospect: Prospect;
}): RenderedText {
  const { agent, ws, account, excludedCompanies, step, templates, ap, prospect } = args;
  const opts = toPersonalization(agent);
  const hasEn = templates.some((t) => t.stepId === step.id && t.lang === "en" && t.status === "APPROVED");
  const profileText = [prospect.title, prospect.headline].filter(Boolean).join(" ");
  const lang = prospect.lang === "en" || prospect.lang === "tr" ? (opts.english.enabled && hasEn ? prospect.lang : "tr") : chooseLanguage(profileText, opts, hasEn);
  const tpl = pickTemplate(templates, step.id, ap.segmentId, lang, ap.id);
  if (!tpl) return { text: "", ok: false, issues: ["Bu adım için onaylı metin yok."], lang };
  const values = {
    hitap: salutationFor(prospect.fullName, answersSalutation(agent)),
    kurum: prospect.company ?? undefined,
    ...optionalValues(
      { mutualName: prospect.mutualName ?? undefined, recentPostText: prospect.postTopic ?? undefined, sharedSchool: prospect.sharedSchool ?? undefined, city: prospect.location ?? undefined, senderCity: undefined },
      opts,
      lang === "en" ? "en" : "tr",
    ),
  };
  const kind = step.type === "INVITE" ? "invite_note" : "message";
  const rules = toRules(agent, ws, account, excludedCompanies);
  // Takiplerde web sitesi linki zorunlu değil
  const r = renderForPerson(tpl.body, values, kind, step.type === "FOLLOW_UP" ? { ...rules, requiredLink: undefined } : rules);
  return { text: r.text, ok: r.ok, issues: r.issues.map((i) => i.message), templateId: tpl.id, lang };
}

function needsApproval(mode: ReviewMode, isFirstOutbound: boolean): boolean {
  if (mode === "REVIEW_ALL") return true;
  if (mode === "REVIEW_FIRST") return isFirstOutbound;
  return false;
}

const DISPATCH_KIND: Partial<Record<SequenceStep["type"], DispatchKind>> = {
  ACCEPTED_MESSAGE: "accepted_message",
  CONNECTED_MESSAGE: "connected_message",
  OPEN_MESSAGE: "connected_message",
  FOLLOW_UP: "follow_up",
  INMAIL: "inmail",
};

const MESSAGE_PRIORITY: Partial<Record<SequenceStep["type"], number>> = {
  ACCEPTED_MESSAGE: PRIORITY.acceptedMessage,
  CONNECTED_MESSAGE: 7,
  OPEN_MESSAGE: 7,
  FOLLOW_UP: PRIORITY.followUp,
  INMAIL: 8,
};

interface NewJob {
  linkedinAccountId: string;
  type: JobType;
  status: "PENDING" | "AWAITING_APPROVAL";
  priority: number;
  runAfter: Date;
  payload: Prisma.InputJsonValue;
  draftText?: string;
  agentProspectId?: string;
  lastError?: string;
}

const job = (j: Omit<NewJob, "payload"> & { payload: JobPayload }): NewJob => ({ ...j, payload: j.payload as unknown as Prisma.InputJsonValue });

/**
 * Hesap için planlama. `force` verilmezse 2 dakikada bir çalışır (eşzamanlı çağrılar
 * veritabanındaki zaman damgasıyla elenir).
 */
export async function planAccount(accountId: string, opts: { now?: Date; force?: boolean } = {}): Promise<void> {
  const now = opts.now ?? new Date();
  if (!opts.force) {
    const claimed = await prisma.linkedinAccount.updateMany({
      where: { id: accountId, OR: [{ lastPlannedAt: null }, { lastPlannedAt: { lt: new Date(now.getTime() - PLAN_EVERY_MS) } }] },
      data: { lastPlannedAt: now },
    });
    if (claimed.count === 0) return;
  } else {
    await prisma.linkedinAccount.update({ where: { id: accountId }, data: { lastPlannedAt: now } });
  }

  const account = await prisma.linkedinAccount.findUnique({ where: { id: accountId }, include: { workspace: true } });
  if (!account || account.status !== "CONNECTED") return;
  if (account.pausedUntil && account.pausedUntil > now) return;
  const ws = account.workspace;
  const config = toScheduleConfig(account);
  const quiet = ws.quietDays;
  const today = localDay(now, config.utcOffsetMin);
  const inWindow = nextOpenSlot(now, config, quiet)?.getTime() === now.getTime();

  const excludedCompanies = (await prisma.suppression.findMany({ where: { workspaceId: ws.id, kind: "company" }, select: { value: true } })).map((s) => s.value);

  const agents = await prisma.agent.findMany({
    where: { linkedinAccountId: account.id, status: "ACTIVE" },
    include: { steps: true, segments: true, targetAccounts: true },
  });

  const newJobs: NewJob[] = [];

  /* ---------- Davet bütçesi ---------- */
  const [invitesDoneToday, invitesDone7d, invitesPlannedToday, visitsToday] = await Promise.all([
    prisma.job.count({ where: { linkedinAccountId: account.id, type: "SEND_INVITE", status: "DONE", finishedAt: { gte: today.startUtc } } }),
    prisma.job.count({ where: { linkedinAccountId: account.id, type: "SEND_INVITE", status: "DONE", finishedAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    prisma.job.count({ where: { linkedinAccountId: account.id, type: "SEND_INVITE", status: { in: [...OPEN_JOB] }, runAfter: { lt: today.endUtc } } }),
    prisma.job.count({ where: { linkedinAccountId: account.id, type: "VISIT_PROFILE", createdAt: { gte: today.startUtc } } }),
  ]);
  const weeksConnected = account.connectedAt ? Math.floor((now.getTime() - account.connectedAt.getTime()) / (7 * DAY)) : 0;
  const weeklyBudget = account.warmupEnabled ? warmupBudget(account.weeklyInvites, weeksConnected) : account.weeklyInvites;
  const invitesLeft = Math.max(
    0,
    invitesRemainingToday({
      config,
      weeklyBudget,
      localDay: today.weekday,
      sentToday: invitesDoneToday,
      sentLast7Days: invitesDone7d + account.externalInvites7d,
    }) - invitesPlannedToday,
  );

  /* ---------- Mesaj bütçesi ---------- */
  const messagesUsedToday = await prisma.job.count({
    where: {
      linkedinAccountId: account.id,
      type: { in: ["SEND_MESSAGE", "SEND_INMAIL"] },
      OR: [
        { status: "DONE", finishedAt: { gte: today.startUtc } },
        { status: { in: [...OPEN_JOB] }, runAfter: { lt: today.endUtc } },
      ],
    },
  });
  let messagesLeft = messagesRemainingToday(account.dailyMessageLimit, messagesUsedToday);
  let inmailCredits = account.inmailCredits ?? 0;

  /* ---------- Kampanya bazında kararlar ---------- */
  type InviteCand = { ap: AgentProspect; prospect: Prospect; step: SequenceStep; company?: string; priority: number; note?: () => RenderedText };
  const perAgent = new Map<string, { visits: InviteCand[]; invites: InviteCand[] }>();
  type MsgCand = { id: string; priority: number; dueAt: Date; make: () => NewJob | null };
  const messageCands: MsgCand[] = [];

  for (const agent of agents) {
    // "Yalnızca bul" kampanyaları hiçbir şey göndermez; yalnızca kişi bulur ve puanlar
    if (agent.mode === "FIND_ONLY") continue;
    const agentConfig = restrictToWindow(config, windowOf(agent));
    const sequence = toSequence(agent, agent.steps);
    const stepById = new Map(agent.steps.map((s) => [s.id, s]));
    const templates = await prisma.template.findMany({ where: { step: { agentId: agent.id }, status: "APPROVED" } });
    const aps = await prisma.agentProspect.findMany({
      where: {
        agentId: agent.id,
        OR: [
          { stage: { in: [...ACTIVE_STAGES] } },
          // InMail seçeneği: geri çekilmiş ve henüz InMail gitmemiş, puanı yeterli kişiler
          ...(agent.inmailEnabled ? [{ stage: "WITHDRAWN" as const, inmailSentAt: null, fitScore: { gte: agent.inmailMinFitScore } }] : []),
        ],
      },
      include: { prospect: { include: { messages: { where: { direction: "OUTBOUND", agentId: agent.id }, orderBy: { sentAt: "asc" } } } } },
    });
    if (!aps.length) continue;
    const busy = new Set(
      (
        await prisma.job.findMany({
          where: { agentProspectId: { in: aps.map((a) => a.id) }, status: { in: [...OPEN_JOB] } },
          select: { agentProspectId: true },
        })
      ).map((j) => j.agentProspectId),
    );
    const inmailsThisWeek = await prisma.job.count({
      where: { type: "SEND_INMAIL", createdAt: { gte: new Date(now.getTime() - 7 * DAY) }, agentProspectId: { in: aps.map((a) => a.id) } },
    });
    let inmailLeftForAgent = Math.max(0, agent.inmailWeeklyMax - inmailsThisWeek);

    const bucket = { visits: [] as InviteCand[], invites: [] as InviteCand[] };
    perAgent.set(agent.id, bucket);
    const inviteStep = sequence.newPersonSteps[0] ? stepById.get(sequence.newPersonSteps[0].id) : undefined;

    for (const ap of aps) {
      if (busy.has(ap.id)) continue;
      const p = ap.prospect;
      if (p.cooldownUntil && p.cooldownUntil > now && ap.stage === "QUEUED") continue;
      const inviteStepId = inviteStep?.id;
      const state: ProspectState = {
        degree: ap.branch === "CONNECTED" ? 1 : p.degree === 3 ? 3 : 2,
        visitedAt: ap.visitedAt ?? undefined,
        invitedAt: ap.inviteSentAt ?? undefined,
        acceptedAt: ap.branch === "CONNECTED" ? undefined : ap.connectedAt ?? undefined,
        repliedAt: ap.repliedAt ?? undefined,
        withdrawnAt: ap.withdrawnAt ?? undefined,
        sent: p.messages.filter((m) => m.stepId && m.stepId !== inviteStepId).map((m) => ({ stepId: m.stepId!, at: m.sentAt })),
        openProfile: p.openProfile,
        fitScore: ap.fitScore ?? undefined,
        inmailCreditsLeft: Math.min(inmailCredits, inmailLeftForAgent),
      };
      const action = nextAction(sequence, state, now);
      const priority = ap.priority ?? ap.fitScore ?? 50;

      switch (action.kind) {
        case "visit":
          if (inviteStep) bucket.visits.push({ ap, prospect: p, step: inviteStep, company: p.company ?? undefined, priority });
          break;
        case "invite": {
          const step = stepById.get(action.stepId);
          if (step)
            bucket.invites.push({
              ap,
              prospect: p,
              step,
              company: p.company ?? undefined,
              priority,
              note: () => renderStep({ agent, ws, account, excludedCompanies, step, templates, ap, prospect: p }),
            });
          break;
        }
        case "message":
        case "inmail": {
          const step = stepById.get(action.stepId);
          if (!step) break;
          const isInmail = action.kind === "inmail";
          const kind = DISPATCH_KIND[step.type] ?? "follow_up";
          const prio = MESSAGE_PRIORITY[step.type] ?? PRIORITY.followUp;
          const isFirst = p.messages.length === 0;
          messageCands.push({
            id: ap.id,
            priority: prio,
            dueAt: now,
            make: () => {
              const at = dispatchTime(kind, now, agentConfig, quiet);
              if (!at) return null;
              const r = renderStep({ agent, ws, account, excludedCompanies, step, templates, ap, prospect: p });
              if (!r.templateId) return null; // onaylı metin yoksa bekler; panelde uyarı görünür
              if (isInmail) {
                inmailCredits--;
                inmailLeftForAgent--;
              }
              const attachment = step.attachmentId ? { fileId: step.attachmentId, name: "" } : undefined;
              const payload: JobPayload = isInmail
                ? { type: "SEND_INMAIL", profileUrl: p.linkedinUrl, subject: inmailSubject(r.lang), text: r.text }
                : { type: "SEND_MESSAGE", profileUrl: p.linkedinUrl, text: r.text, attachment, viaOpenProfile: step.type === "OPEN_MESSAGE" || undefined };
              return job({
                linkedinAccountId: account.id,
                type: isInmail ? "SEND_INMAIL" : "SEND_MESSAGE",
                status: !r.ok || needsApproval(agent.reviewMode, isFirst) ? "AWAITING_APPROVAL" : "PENDING",
                priority: prio,
                runAfter: at,
                payload: { ...payload, stepId: step.id, templateId: r.templateId },
                draftText: r.text,
                agentProspectId: ap.id,
                lastError: r.ok ? undefined : r.issues.join(" "),
              });
            },
          });
          break;
        }
        case "withdraw": {
          if (!account.autoWithdraw) break;
          const at = nextOpenSlot(now, agentConfig, quiet);
          if (at)
            newJobs.push(
              job({
                linkedinAccountId: account.id,
                type: "WITHDRAW_INVITE",
                status: "PENDING",
                priority: 20,
                runAfter: at,
                payload: { type: "WITHDRAW_INVITE", profileUrl: p.linkedinUrl },
                agentProspectId: ap.id,
              }),
            );
          break;
        }
        case "done":
          // Geri çekilmiş kişi zaten son aşamada; yalnızca aşama değişiyorsa yazılır
          if (ap.stage !== "WITHDRAWN") await finish(ap, p, "FINISHED");
          break;
        case "wait":
          break;
      }
    }
  }

  /* ---------- Davetleri kampanyalara böl ve zamanla ---------- */
  const alloc = allocateInvites(
    invitesLeft,
    agents.map((a) => ({ id: a.id, sharePct: a.budgetSharePct, demand: perAgent.get(a.id)?.invites.length ?? 0 })),
  );
  const inviteJobs: { cand: InviteCand; agent: Agent }[] = [];
  const visitJobs: { cand: InviteCand; agent: Agent }[] = [];
  const dailyQuota = invitesLeft + invitesDoneToday + invitesPlannedToday;
  let visitsLeft = Math.max(0, Math.ceil(dailyQuota * 1.2) - visitsToday);

  for (const agent of agents) {
    const b = perAgent.get(agent.id);
    if (!b) continue;
    const activePerCompany = await activeCompanies(agent.id);
    const byPriority = (x: InviteCand, y: InviteCand) => y.priority - x.priority;
    const inv = throttleByCompany([...b.invites].sort(byPriority), agent.maxPerCompany, activePerCompany).selected.slice(0, alloc.get(agent.id) ?? 0);
    for (const cand of inv) inviteJobs.push({ cand, agent });
    const share = Math.ceil(visitsLeft * (agent.budgetSharePct / Math.max(1, agents.reduce((t, a) => t + a.budgetSharePct, 0))));
    const vis = throttleByCompany([...b.visits].sort(byPriority), agent.maxPerCompany, activePerCompany).selected.slice(0, share);
    for (const cand of vis) visitJobs.push({ cand, agent });
  }
  visitJobs.splice(visitsLeft);
  visitsLeft -= visitJobs.length;

  /** Kampanyanın penceresi varsa zamanlar o pencereye göre ayrı üretilir; yoksa hesap takvimiyle ortak. */
  const assign = <T extends { agent: Agent }>(items: T[]): (T & { at: Date })[] => {
    const out: (T & { at: Date })[] = [];
    const shared = items.filter((x) => !windowOf(x.agent));
    const pooled = planInviteTimes({ now, count: shared.length, config });
    shared.slice(0, pooled.length).forEach((x, i) => out.push({ ...x, at: pooled[i]! }));
    const byAgent = new Map<string, T[]>();
    for (const x of items) if (windowOf(x.agent)) byAgent.set(x.agent.id, [...(byAgent.get(x.agent.id) ?? []), x]);
    for (const list of byAgent.values()) {
      const times = planInviteTimes({ now, count: list.length, config: restrictToWindow(config, windowOf(list[0]!.agent)) });
      list.slice(0, times.length).forEach((x, i) => out.push({ ...x, at: times[i]! }));
    }
    return out;
  };

  for (const { cand, agent, at } of assign(inviteJobs)) {
    // Davet notu: onaylı metin yoksa davet gönderilmez (Mesajlar sekmesinde "onay bekliyor" görünür);
    // metin kural denetiminden geçmezse davet onaya düşer.
    const r = cand.note?.();
    const hasNote = !!r?.templateId;
    if (!hasNote) continue;
    newJobs.push(
      job({
        linkedinAccountId: account.id,
        type: "SEND_INVITE",
        status: (hasNote && !r!.ok) || needsApproval(agent.reviewMode, true) ? "AWAITING_APPROVAL" : "PENDING",
        priority: PRIORITY.invite,
        runAfter: at,
        payload: { type: "SEND_INVITE", profileUrl: cand.prospect.linkedinUrl, note: hasNote ? r!.text : undefined, stepId: cand.step.id, templateId: r?.templateId },
        draftText: hasNote ? r!.text : undefined,
        agentProspectId: cand.ap.id,
        lastError: hasNote && !r!.ok ? r!.issues.join(" ") : undefined,
      }),
    );
  }

  // Ziyaretler davet saatleriyle aynı pencerelere yayılır
  for (const { cand, agent, at } of assign(visitJobs))
    newJobs.push(
      job({
        linkedinAccountId: account.id,
        type: "VISIT_PROFILE",
        status: "PENDING",
        priority: 15,
        runAfter: at,
        payload: {
          type: "VISIT_PROFILE",
          profileUrl: cand.prospect.linkedinUrl,
          readPost: (agent.firstLineEnabled && agent.firstLineSources.includes("post")) || undefined,
          readEducation: (agent.firstLineEnabled && agent.firstLineSources.includes("school")) || undefined,
        },
        agentProspectId: cand.ap.id,
      }),
    );

  /* ---------- Mesajlar: günlük sınır, öncelikli olan önce ---------- */
  const { today: todaysMessages } = pickMessagesForToday(messageCands, messagesLeft);
  for (const m of todaysMessages) {
    const j = m.make();
    if (j) {
      newJobs.push(j);
      messagesLeft--;
    }
  }

  /* ---------- Düzenli kontroller (yalnızca gönderim saatlerinde) ---------- */
  if (inWindow) newJobs.push(...(await periodicJobs(account, agents, now)));

  if (newJobs.length) {
    await prisma.job.createMany({ data: newJobs });
  }
}

function inmailSubject(lang: string): string {
  return lang === "en" ? "Brief introduction" : "Kısa bir tanışma";
}

async function finish(ap: AgentProspect, p: Prospect, stage: "FINISHED" | "WITHDRAWN") {
  const cooldown = stage === "FINISHED" ? 90 : 21;
  await prisma.$transaction([
    prisma.agentProspect.update({ where: { id: ap.id }, data: { stage } }),
    prisma.prospect.update({ where: { id: p.id }, data: { cooldownUntil: new Date(Date.now() + cooldown * DAY) } }),
  ]);
}

/** Kampanyada şu an süreci süren kişilerin kurum dağılımı (aynı kurumdan aynı anda en fazla N kişi) */
async function activeCompanies(agentId: string): Promise<Map<string, number>> {
  const rows = await prisma.agentProspect.findMany({
    where: { agentId, stage: { in: ["INVITE_SENT", "CONNECTED", "MESSAGED", "INMAIL_SENT"] } },
    select: { prospect: { select: { company: true } } },
  });
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = r.prospect.company ? fold(r.prospect.company) : "";
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

async function periodicJobs(account: LinkedinAccount, agents: Agent[], now: Date): Promise<NewJob[]> {
  const out: NewJob[] = [];
  const last = async (type: JobType) =>
    prisma.job.findFirst({ where: { linkedinAccountId: account.id, type }, orderBy: { createdAt: "desc" }, select: { createdAt: true, status: true } });
  const due = async (type: JobType, everyMs: number) => {
    const l = await last(type);
    if (!l) return true;
    if (OPEN_JOB.includes(l.status as (typeof OPEN_JOB)[number])) return false;
    return now.getTime() - l.createdAt.getTime() >= everyMs;
  };
  const agentIds = agents.map((a) => a.id);
  const [invited, talking] = await Promise.all([
    prisma.agentProspect.count({ where: { agentId: { in: agentIds }, stage: "INVITE_SENT" } }),
    prisma.agentProspect.count({ where: { agentId: { in: agentIds }, stage: { in: ["CONNECTED", "MESSAGED", "INMAIL_SENT", "REPLIED"] } } }),
  ]);
  const base = { linkedinAccountId: account.id, status: "PENDING" as const, runAfter: now };
  if (invited > 0 && (await due("CHECK_CONNECTIONS", CHECK_EVERY_MS)))
    out.push(job({ ...base, type: "CHECK_CONNECTIONS", priority: 0, payload: { type: "CHECK_CONNECTIONS", limit: 40 } }));
  if (talking > 0 && (await due("CHECK_INBOX", CHECK_EVERY_MS)))
    out.push(job({ ...base, type: "CHECK_INBOX", priority: 2, payload: { type: "CHECK_INBOX", limit: 20 } }));
  if (await due("SYNC_SENT_INVITES", 20 * HOUR)) out.push(job({ ...base, type: "SYNC_SENT_INVITES", priority: 30, payload: { type: "SYNC_SENT_INVITES" } }));

  // Kişi bulma sürekli çalışır: kampanyada bekleyen kişi tamponu (üç haftalık davet hakkı) dolmadıkça,
  // önceki tur bittikten 45 dk sonra yeni tur başlar; günde en çok 6 tur (LinkedIn'i yormamak için).
  for (const agent of agents) {
    const queued = await prisma.agentProspect.count({ where: { agentId: agent.id, stage: "QUEUED" } });
    const target = Math.ceil((account.weeklyInvites * agent.budgetSharePct) / 100) * 3;
    if (queued >= target) continue;
    const forAgent = { linkedinAccountId: account.id, type: "DISCOVER" as const, payload: { path: ["agentId"], equals: agent.id } };
    if (await prisma.job.count({ where: { ...forAgent, status: { in: [...OPEN_JOB] } } })) continue;
    const lastDiscover = await prisma.job.findFirst({ where: forAgent, orderBy: { createdAt: "desc" }, select: { createdAt: true, finishedAt: true } });
    const lastAt = lastDiscover ? (lastDiscover.finishedAt ?? lastDiscover.createdAt) : null;
    if (lastAt && now.getTime() - lastAt.getTime() < 45 * 60_000) continue;
    const rounds = await prisma.job.count({ where: { ...forAgent, createdAt: { gte: new Date(now.getTime() - DAY) } } });
    if (rounds >= 6 * 8) continue; // bir tur birkaç işe bölünür (en çok ~8)
    const t = readTargeting(agent.targeting);
    // Hedef kurum listesi uzun olabilir: her turda en uzun süredir taranmayan 40 kurum alınır, böylece liste sırayla döner
    const accounts = await prisma.targetAccount.findMany({
      where: { agentId: agent.id },
      orderBy: [{ lastSearchedAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: 40,
      select: { id: true, name: true },
    });
    const steps = planDiscovery({
      titles: t.titles,
      geoUrns: t.geoUrns,
      industryIds: t.industryIds,
      targetAccounts: accounts.map((a) => a.name),
      includeConnections: agent.includeConnections,
      engagementPostUrls: t.engagementPostUrls,
    }).filter((s): s is typeof s & { url: string } => !!s.url);
    if (!steps.length) continue;
    if (accounts.length) await prisma.targetAccount.updateMany({ where: { id: { in: accounts.map((a) => a.id) } }, data: { lastSearchedAt: now } });
    for (const chunk of chunkDiscoverySteps(steps)) {
      out.push(
        job({
          ...base,
          type: "DISCOVER",
          priority: 40,
          payload: { type: "DISCOVER", agentId: agent.id, steps: chunk, viewBudget: profileViewBudget(account.premium) },
        }),
      );
    }
  }
  return out;
}

/**
 * Son kapı: çalışana verilmeden hemen önce işin bugünkü sınırlara sığdığı denetlenir.
 * (Örneğin onay kuyruğunda bekleyen eski davetler aynı gün topluca onaylanırsa günlük sınır aşılmaz.)
 * Sığmıyorsa bir sonraki uygun güne ertelenecek zaman döner; sığıyorsa null.
 */
export async function gateJob(account: LinkedinAccount, jobRow: { type: JobType }, quietDays: string[], now = new Date()): Promise<Date | null> {
  if (jobRow.type !== "SEND_INVITE" && jobRow.type !== "SEND_MESSAGE" && jobRow.type !== "SEND_INMAIL") return null;
  const config = toScheduleConfig(account);
  const today = localDay(now, config.utcOffsetMin);
  const tomorrow = () => nextOpenSlot(today.endUtc, config, quietDays) ?? new Date(today.endUtc.getTime() + 9 * HOUR);
  if (jobRow.type === "SEND_INVITE") {
    const [doneToday, done7d] = await Promise.all([
      prisma.job.count({ where: { linkedinAccountId: account.id, type: "SEND_INVITE", status: { in: ["DONE", "RUNNING"] }, OR: [{ finishedAt: { gte: today.startUtc } }, { status: "RUNNING" }] } }),
      prisma.job.count({ where: { linkedinAccountId: account.id, type: "SEND_INVITE", status: "DONE", finishedAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    ]);
    const weeksConnected = account.connectedAt ? Math.floor((now.getTime() - account.connectedAt.getTime()) / (7 * DAY)) : 0;
    const weekly = account.warmupEnabled ? warmupBudget(account.weeklyInvites, weeksConnected) : account.weeklyInvites;
    const left = invitesRemainingToday({ config, weeklyBudget: weekly, localDay: today.weekday, sentToday: doneToday, sentLast7Days: done7d + account.externalInvites7d });
    return left > 0 ? null : tomorrow();
  }
  const msgsToday = await prisma.job.count({
    where: { linkedinAccountId: account.id, type: { in: ["SEND_MESSAGE", "SEND_INMAIL"] }, OR: [{ status: "DONE", finishedAt: { gte: today.startUtc } }, { status: "RUNNING" }] },
  });
  return msgsToday < account.dailyMessageLimit ? null : tomorrow();
}
