import "server-only";
/**
 * Çalışanın bildirdiği sonuçları işler: kişi ve konuşma kayıtlarını günceller, hata
 * türüne göre hesabı duraklatır ya da işi yeniden dener.
 */
import { createHash } from "node:crypto";
import {
  POST_TOPICS,
  canonicalProfileUrl,
  chooseCampaign,
  companiesFromResult,
  classifyReply,
  containsFolded,
  countExternalInvites,
  detectLanguage,
  featuresOf,
  isOpenToWork,
  learnedBoost,
  titleGroupOf,
  resolveUncertain,
  priorityScore,
  scoreProspect,
  splitHeadline,
  suppressesPermanently,
  type CompanyDiscoverData,
  type ConnectionsData,
  type InstitutionKind,
  type DiscoverData,
  type InboxData,
  type InmailData,
  type InviteData,
  type JobPayload,
  type JobResult,
  type ReplyLabel,
  type SentInvitesData,
  type VisitData,
} from "@hfo/core";
import { prisma, Prisma, type Job, type LinkedinAccount } from "@hfo/db";
import { toTargeting } from "./convert";
import { pooledModel } from "./learning-model";
import { planAccount } from "./planner";
import { extendRetention } from "./retention";
import { fireWebhook } from "./webhook";

const DAY = 86_400_000;
const MAX_ATTEMPTS = 3;

const REPLY_DB: Record<ReplyLabel, "INTERESTED" | "LATER" | "NOT_INTERESTED" | "WRONG_PERSON" | "OTHER"> = {
  ilgileniyor: "INTERESTED",
  sonra: "LATER",
  ilgilenmiyor: "NOT_INTERESTED",
  yanlis_kisi: "WRONG_PERSON",
  diger: "OTHER",
};

const norm = (t: string) => t.replace(/\s+/g, " ").trim();

export const urlHash = (url: string) => createHash("sha256").update(canonicalProfileUrl(url) ?? url).digest("hex");

export async function handleResult(account: LinkedinAccount, job: Job, result: JobResult): Promise<void> {
  const payload = job.payload as unknown as JobPayload;
  const now = new Date();

  if (!result.ok) {
    await handleError(account, job, result.error, result.message);
    return;
  }
  await prisma.job.update({ where: { id: job.id }, data: { status: "DONE", finishedAt: now, lockedUntil: null, lastError: null } });

  const ap = job.agentProspectId
    ? await prisma.agentProspect.findUnique({ where: { id: job.agentProspectId }, include: { prospect: true } })
    : null;

  switch (payload.type) {
    case "VISIT_PROFILE": {
      if (!ap) break;
      const d = (result.data ?? {}) as VisitData;
      const split = splitHeadline(d.headline);
      const topic = d.recentPostText ? POST_TOPICS.find((t) => t.keywords.some((k) => containsFolded(d.recentPostText!, k)))?.keywords[0] : undefined;
      const profileText = [d.title ?? split.title, d.headline, d.about].filter(Boolean).join(" ");
      await prisma.$transaction([
        prisma.agentProspect.update({
          where: { id: ap.id },
          data: {
            visitedAt: now,
            // Ziyarette zaten bağlantı olduğu anlaşıldıysa davetsiz kola geçer
            ...(d.degree === 1 ? { branch: "CONNECTED" as const } : {}),
            ...(d.invitePending ? { stage: "INVITE_SENT" as const, inviteSentAt: now } : {}),
          },
        }),
        prisma.prospect.update({
          where: { id: ap.prospectId },
          data: {
            fullName: d.fullName?.trim() || undefined,
            degree: d.degree ?? undefined,
            openProfile: d.openProfile ?? undefined,
            title: d.title ?? split.title ?? undefined,
            company: d.company ?? split.company ?? undefined,
            location: d.location ?? undefined,
            headline: d.headline ?? undefined,
            mutualConnections: d.mutualConnections ?? undefined,
            mutualName: d.mutualName ?? undefined,
            sharedSchool: d.sharedSchool ?? undefined,
            // Paylaşımın metni saklanmaz; yalnızca tanınan konu
            postTopic: topic ?? undefined,
            lang: profileText ? detectLanguage(profileText) : undefined,
          },
        }),
      ]);
      break;
    }

    case "SEND_INVITE": {
      if (!ap) break;
      const d = (result.data ?? { status: "sent" }) as InviteData;
      if (d.status === "already_connected") {
        await prisma.agentProspect.update({ where: { id: ap.id }, data: { branch: "CONNECTED", stage: "QUEUED" } });
        await prisma.prospect.update({ where: { id: ap.prospectId }, data: { degree: 1 } });
        break;
      }
      await prisma.agentProspect.update({ where: { id: ap.id }, data: { stage: "INVITE_SENT", inviteSentAt: now } });
      await extendRetention(ap.prospectId, account.workspaceId, now);
      if (d.status === "sent" && payload.note) {
        await prisma.message.create({
          data: { prospectId: ap.prospectId, agentId: ap.agentId, stepId: payload.stepId, templateId: payload.templateId, direction: "OUTBOUND", body: payload.note, sentAt: now },
        });
      }
      break;
    }

    case "SEND_MESSAGE":
    case "SEND_INMAIL": {
      if (!ap) break;
      await extendRetention(ap.prospectId, account.workspaceId, now);
      const isInmail = payload.type === "SEND_INMAIL";
      await prisma.$transaction([
        prisma.message.create({
          data: { prospectId: ap.prospectId, agentId: ap.agentId, stepId: payload.stepId, templateId: payload.templateId, direction: "OUTBOUND", body: payload.text, sentAt: now },
        }),
        prisma.agentProspect.update({
          where: { id: ap.id },
          // Cevap vermiş kişiye elle yazılan yanıt konuşmayı "cevap verdi" aşamasında bırakır
          data: isInmail ? { stage: "INMAIL_SENT", inmailSentAt: now, lastMessageAt: now } : { stage: ap.stage === "REPLIED" ? "REPLIED" : "MESSAGED", lastMessageAt: now },
        }),
      ]);
      if (isInmail) {
        const credits = (result.data as InmailData | undefined)?.creditsLeft;
        await prisma.linkedinAccount.update({
          where: { id: account.id },
          data: { inmailCredits: credits ?? (account.inmailCredits != null ? Math.max(0, account.inmailCredits - 1) : undefined) },
        });
      }
      break;
    }

    case "WITHDRAW_INVITE": {
      if (!ap) break;
      await prisma.$transaction([
        prisma.agentProspect.update({ where: { id: ap.id }, data: { stage: "WITHDRAWN", withdrawnAt: now } }),
        prisma.prospect.update({ where: { id: ap.prospectId }, data: { cooldownUntil: new Date(now.getTime() + 21 * DAY) } }),
      ]);
      break;
    }

    case "CHECK_CONNECTIONS": {
      const d = (result.data ?? { profileUrls: [] }) as ConnectionsData;
      const urls = d.profileUrls.map((u) => canonicalProfileUrl(u)).filter((u): u is string => !!u);
      if (!urls.length) break;
      const accepted = await prisma.agentProspect.findMany({
        where: { stage: "INVITE_SENT", agent: { linkedinAccountId: account.id }, prospect: { linkedinUrl: { in: urls } } },
        select: { id: true, prospectId: true },
      });
      if (!accepted.length) break;
      await prisma.$transaction([
        prisma.agentProspect.updateMany({ where: { id: { in: accepted.map((a) => a.id) } }, data: { stage: "CONNECTED", connectedAt: now } }),
        prisma.prospect.updateMany({ where: { id: { in: accepted.map((a) => a.prospectId) } }, data: { degree: 1 } }),
      ]);
      await notifyAccepted(accepted.map((a) => a.id));
      // Kabul edenlere detay mesajı hemen planlansın (1-5 dakika içinde)
      await planAccount(account.id, { force: true });
      break;
    }

    case "CHECK_INBOX":
      await ingestInbox(account, (result.data ?? { threads: [] }) as InboxData, now);
      break;

    case "SYNC_SENT_INVITES": {
      const d = (result.data ?? { invites: [] }) as SentInvitesData;
      const systemUrls = (
        await prisma.prospect.findMany({
          where: { workspaceId: account.workspaceId, agents: { some: { inviteSentAt: { gte: new Date(now.getTime() - 8 * DAY) } } } },
          select: { linkedinUrl: true },
        })
      ).map((p) => p.linkedinUrl);
      const external = countExternalInvites(
        d.invites.map((i) => ({ profileUrl: i.profileUrl, sentAt: new Date(i.sentAt) })),
        systemUrls,
        now,
      );
      await prisma.linkedinAccount.update({ where: { id: account.id }, data: { externalInvites7d: external } });
      break;
    }

    case "DISCOVER_COMPANIES":
      await ingestCompanies(account.workspaceId, (result.data ?? { companies: [], viewed: 0, queries: [] }) as CompanyDiscoverData, payload.kind);
      break;

    case "DISCOVER":
      await ingestDiscovery(account, payload.agentId, (result.data ?? { candidates: [], viewed: 0, steps: [] }) as DiscoverData, job.id);
      break;
  }
}

async function handleError(account: LinkedinAccount, job: Job, error: string, message?: string) {
  const now = new Date();
  const fail = (data: Prisma.JobUpdateInput) => prisma.job.update({ where: { id: job.id }, data: { lockedUntil: null, lastError: message ?? error, ...data } });

  switch (error) {
    case "session_expired":
      // İş kaybolmaz: oturum açılınca yeniden denenir
      await prisma.linkedinAccount.update({ where: { id: account.id }, data: { status: "NEEDS_LOGIN" } });
      await fail({ status: "PENDING" });
      return;
    case "linkedin_warning":
    case "invite_limit": {
      const until = new Date(now.getTime() + DAY);
      await prisma.linkedinAccount.update({
        where: { id: account.id },
        data: { status: "PAUSED", pausedUntil: until, lastWarning: message ?? (error === "invite_limit" ? "LinkedIn haftalık davet sınırı uyarısı gösterdi." : "LinkedIn bir uyarı gösterdi.") },
      });
      await fail({ status: "PENDING", runAfter: until });
      return;
    }
    case "not_found":
    case "cannot_message": {
      await fail({ status: "FAILED", finishedAt: now });
      if (job.agentProspectId) {
        await prisma.agentProspect.update({
          where: { id: job.agentProspectId },
          data: { stage: "SKIPPED", skipReason: error === "not_found" ? "Profil bulunamadı." : (message ?? "LinkedIn bu kişiye gönderime izin vermedi.") },
        });
      }
      return;
    }
    default: {
      const attempts = job.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) await fail({ status: "FAILED", attempts, finishedAt: now });
      else await fail({ status: "PENDING", attempts, runAfter: new Date(now.getTime() + attempts * 15 * 60_000) });
    }
  }
}

/** LinkedIn şirket aramasından gelen kurumlar havuza eklenir; var olanlara yalnızca eksik bilgi yazılır. */
async function ingestCompanies(workspaceId: string, data: CompanyDiscoverData, kind?: string) {
  const rows = companiesFromResult(data, kind as InstitutionKind | undefined);
  if (!rows.length) return;
  const existing = await prisma.institution.findMany({
    where: { workspaceId, OR: [{ key: { in: rows.map((r) => r.key) } }, { linkedinUrl: { in: rows.map((r) => r.linkedinUrl) } }] },
    select: { id: true, key: true, linkedinUrl: true, size: true, orgType: true },
  });
  const byKey = new Map(existing.map((e) => [e.key, e]));
  const byUrl = new Map(existing.filter((e) => e.linkedinUrl).map((e) => [e.linkedinUrl!, e]));
  const fresh: Prisma.InstitutionCreateManyInput[] = [];
  for (const r of rows) {
    const e = byKey.get(r.key) ?? byUrl.get(r.linkedinUrl);
    if (!e) {
      fresh.push({ workspaceId, key: r.key, name: r.name, rawName: r.rawName, kind: r.kind, city: r.city ?? null, orgType: r.orgType ?? null, size: r.size ?? null, linkedinUrl: r.linkedinUrl, source: "linkedin" });
      continue;
    }
    const patch: Prisma.InstitutionUpdateInput = {};
    if (!e.linkedinUrl) patch.linkedinUrl = r.linkedinUrl;
    if (!e.size && r.size) patch.size = r.size;
    if (!e.orgType && r.orgType) patch.orgType = r.orgType;
    if (Object.keys(patch).length) await prisma.institution.update({ where: { id: e.id }, data: patch });
  }
  if (fresh.length) await prisma.institution.createMany({ data: fresh, skipDuplicates: true });
}

/** Gelen kutusu: bilinen kişilerden gelen yeni mesajlar konuşmaya eklenir, akış durur. */
async function ingestInbox(account: LinkedinAccount, data: InboxData, now: Date) {
  for (const th of data.threads) {
    const url = canonicalProfileUrl(th.profileUrl);
    if (!url) continue;
    const prospect = await prisma.prospect.findUnique({ where: { workspaceId_linkedinUrl: { workspaceId: account.workspaceId, linkedinUrl: url } } });
    if (!prospect) continue;
    const known = await prisma.message.findMany({ where: { prospectId: prospect.id }, select: { body: true, direction: true } });
    const seen = new Set(known.map((m) => `${m.direction}:${m.body.trim()}`));
    // Yalnızca bizim gönderdiğimiz bir mesajdan SONRA gelenler cevap sayılır; mevcut bağlantılarla
    // yıllar önceki eski yazışmalar cevap gibi algılanıp akışı durdurmaz.
    const ours = known.filter((m) => m.direction === "OUTBOUND").map((m) => norm(m.body).slice(0, 60));
    // Gönderen adı okunamasa bile metin eşleşmesiyle kendi mesajlarımız tanınır
    const isOurs = (t: string) => ours.some((o) => o.length >= 10 && norm(t).startsWith(o.slice(0, 40)));
    const lastOurIdx = th.messages.reduce((idx, m, i) => (isOurs(m.text) ? i : idx), -1);
    if (lastOurIdx < 0) continue;
    const fresh = th.messages.slice(lastOurIdx + 1).filter((m) => !m.fromMe && !isOurs(m.text) && m.text.trim() && !seen.has(`INBOUND:${m.text.trim()}`));
    if (!fresh.length) continue;

    await prisma.message.createMany({
      data: fresh.map((m) => ({ prospectId: prospect.id, direction: "INBOUND" as const, body: m.text.trim(), sentAt: isNaN(Date.parse(m.at)) ? now : new Date(m.at) })),
    });
    const lastText = fresh.at(-1)!.text;
    const label = classifyReply(lastText);
    const aps = await prisma.agentProspect.findMany({ where: { prospectId: prospect.id, agent: { linkedinAccountId: account.id } } });
    for (const ap of aps) {
      await prisma.agentProspect.update({ where: { id: ap.id }, data: { stage: "REPLIED", repliedAt: ap.repliedAt ?? now, replyLabel: REPLY_DB[label] } });
      // Cevap gelen kişiye bekleyen otomatik mesaj gitmez
      await prisma.job.updateMany({ where: { agentProspectId: ap.id, status: { in: ["PENDING", "AWAITING_APPROVAL"] } }, data: { status: "CANCELLED", lastError: "Kişi cevap verdi." } });
      const ag = await prisma.agent.findUnique({ where: { id: ap.agentId } });
      if (ag?.webhookUrl) {
        const person = { name: prospect.fullName, title: prospect.title, company: prospect.company, linkedinUrl: prospect.linkedinUrl };
        await fireWebhook(ag, { event: "replied", person, message: lastText.slice(0, 500) });
        if (label === "ilgileniyor") await fireWebhook(ag, { event: "interested", person, message: lastText.slice(0, 500) });
      }
      if (label === "ilgileniyor") {
        const exists = await prisma.opportunity.findFirst({ where: { prospectId: prospect.id } });
        if (!exists) await prisma.opportunity.create({ data: { workspaceId: account.workspaceId, prospectId: prospect.id, agentId: ap.agentId } });
      }
    }
    if (suppressesPermanently(label)) {
      await prisma.suppression.upsert({
        where: { workspaceId_kind_value: { workspaceId: account.workspaceId, kind: "person", value: urlHash(url) } },
        update: {},
        create: { workspaceId: account.workspaceId, kind: "person", value: urlHash(url), reason: "İletişim istemediğini yazdı." },
      });
    }
  }
}

/** Kişi bulma: adaylar puanlanır, en uygun kampanyaya alınır; belirsizler kullanıcıya sorulur. */
async function ingestDiscovery(account: LinkedinAccount, agentId: string, data: DiscoverData, jobId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, include: { segments: true } });
  if (!agent) return;
  const now = new Date();
  const ws = await prisma.workspace.findUniqueOrThrow({ where: { id: account.workspaceId } });
  const suppress = await prisma.suppression.findMany({ where: { workspaceId: ws.id }, select: { kind: true, value: true } });
  const excludedCompanies = suppress.filter((s) => s.kind === "company").map((s) => s.value);
  const blockedPeople = new Set(suppress.filter((s) => s.kind === "person").map((s) => s.value));
  const targeting = toTargeting(agent, agent.segments, excludedCompanies);

  // Tüm temsilcilerin sonuçlarından öğrenilen katkı (30 sonuçtan azsa 0)
  const { model } = await pooledModel(ws.id, agentId);
  let added = 0;
  let review = 0;
  let rejected = 0;
  for (const c of data.candidates) {
    const url = canonicalProfileUrl(c.profileUrl);
    if (!url || blockedPeople.has(urlHash(url))) continue;
    const split = c.title || c.company ? { title: c.title, company: c.company } : splitHeadline(c.headline);
    const score = scoreProspect({ fullName: c.fullName, title: split.title, company: split.company, location: c.location, about: c.headline }, targeting);

    const prospect = await prisma.prospect.upsert({
      where: { workspaceId_linkedinUrl: { workspaceId: ws.id, linkedinUrl: url } },
      update: {
        degree: c.degree ?? undefined,
        mutualConnections: c.mutualConnections ?? undefined,
        headline: c.headline ?? undefined,
      },
      create: {
        workspaceId: ws.id,
        linkedinUrl: url,
        fullName: c.fullName,
        title: split.title,
        company: split.company,
        location: c.location,
        headline: c.headline,
        degree: c.degree,
        mutualConnections: c.mutualConnections,
        source: ({ connections: "CONNECTIONS", accounts: "ACCOUNTS", search: "SEARCH", engagers: "ENGAGERS", import: "IMPORT" } as const)[c.source],
        retainUntil: new Date(now.getTime() + ws.retentionMonths * 30 * DAY),
      },
      include: { agents: true },
    });
    if (prospect.agents.some((a) => a.agentId === agentId)) continue;

    const active = prospect.agents.find((a) => ["QUEUED", "INVITE_SENT", "CONNECTED", "MESSAGED", "INMAIL_SENT"].includes(a.stage));
    const lastEnded = prospect.agents.filter((a) => ["FINISHED", "REPLIED"].includes(a.stage)).map((a) => a.lastMessageAt ?? a.createdAt).sort((a, b) => b.getTime() - a.getTime())[0];
    const withdrawn = prospect.agents.map((a) => a.withdrawnAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0];

    if (agent.skipOpenToWork && score.verdict !== "elendi" && isOpenToWork(c.headline, split.title)) {
      score.verdict = "elendi";
      score.reasons = ["İş arayan profil (Open to Work).", ...score.reasons];
    }
    // Kararsız adaylar kampanya ayarına göre: bana sor / ele / yüksek puanlıyı kabul et
    let outcome: "review" | "queue" = "queue";
    if (score.verdict === "belirsiz") {
      const r = resolveUncertain(agent.uncertainPolicy, score.score);
      if (r === "drop") {
        score.verdict = "elendi";
        score.reasons = ["Belirsiz aday; kampanya ayarı gereği elendi.", ...score.reasons];
      } else outcome = r === "queue" ? "queue" : "review";
    }
    if (score.verdict === "elendi") {
      rejected++;
      await prisma.agentProspect.create({
        data: { agentId, prospectId: prospect.id, stage: "SKIPPED", fitScore: score.score, fitReason: score.reasons.join(" · "), skipReason: score.reasons[0], segmentId: score.segmentId },
      });
      continue;
    }
    const decision = chooseCampaign([{ campaignId: agentId, fitScore: score.score, verdict: score.verdict === "belirsiz" ? "uygun" : score.verdict }], { activeCampaignId: active?.agentId, withdrawnAt: withdrawn, lastEndedAt: lastEnded }, now);
    if (!decision.ok) continue;
    const boost = learnedBoost(model, featuresOf({ titleGroup: titleGroupOf(split.title), degree: c.degree, source: c.source }));
    const priority = priorityScore({ candidate: { ...c, profileUrl: url }, fitScore: score.score, learnedBoost: boost });
    if (score.verdict === "belirsiz" && outcome === "review") review++;
    else added++;
    await prisma.agentProspect.create({
      data: {
        agentId,
        prospectId: prospect.id,
        segmentId: score.segmentId,
        stage: score.verdict === "belirsiz" && outcome === "review" ? "NEEDS_REVIEW" : "QUEUED",
        branch: c.degree === 1 ? "CONNECTED" : "NEW_PERSON",
        fitScore: score.score,
        priority,
        fitReason: score.reasons.join(" · "),
      },
    });
  }
  await prisma.auditLog.create({
    data: {
      workspaceId: ws.id,
      actor: "system",
      action: "discover",
      details: { jobId, agentId, viewed: data.viewed, steps: data.steps, added, review, rejected } as Prisma.InputJsonValue,
    },
  });
}

/** Kabul olaylarını kampanyaların webhook adreslerine bildirir (hata akışı durdurmaz). */
async function notifyAccepted(apIds: string[]) {
  try {
    const rows = await prisma.agentProspect.findMany({ where: { id: { in: apIds } }, include: { prospect: true, agent: true } });
    for (const r of rows) {
      if (!r.agent.webhookUrl) continue;
      await fireWebhook(r.agent, { event: "accepted", person: { name: r.prospect.fullName, title: r.prospect.title, company: r.prospect.company, linkedinUrl: r.prospect.linkedinUrl } });
    }
  } catch {
    /* webhook hatası sonuç işlemeyi bozmaz */
  }
}
