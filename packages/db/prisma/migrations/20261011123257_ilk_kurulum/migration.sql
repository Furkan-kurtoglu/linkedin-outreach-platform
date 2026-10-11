-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('CONNECTED', 'NEEDS_LOGIN', 'PAUSED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "ReviewMode" AS ENUM ('REVIEW_ALL', 'REVIEW_FIRST', 'AUTONOMOUS');

-- CreateEnum
CREATE TYPE "StepType" AS ENUM ('VISIT', 'INVITE', 'ACCEPTED_MESSAGE', 'CONNECTED_MESSAGE', 'FOLLOW_UP', 'OPEN_MESSAGE', 'INMAIL');

-- CreateEnum
CREATE TYPE "Branch" AS ENUM ('NEW_PERSON', 'CONNECTED');

-- CreateEnum
CREATE TYPE "SourceKind" AS ENUM ('CONNECTIONS', 'ACCOUNTS', 'SEARCH', 'ENGAGERS', 'IMPORT');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ProspectStage" AS ENUM ('QUEUED', 'NEEDS_REVIEW', 'INVITE_SENT', 'CONNECTED', 'MESSAGED', 'INMAIL_SENT', 'REPLIED', 'WITHDRAWN', 'FINISHED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('OUTBOUND', 'INBOUND');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('VISIT_PROFILE', 'WITHDRAW_INVITE', 'SEND_INVITE', 'SEND_MESSAGE', 'SEND_INMAIL', 'SYNC_SENT_INVITES', 'CHECK_CONNECTIONS', 'CHECK_INBOX', 'DISCOVER');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'AWAITING_APPROVAL', 'RUNNING', 'DONE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReplyLabel" AS ENUM ('INTERESTED', 'LATER', 'NOT_INTERESTED', 'WRONG_PERSON', 'OTHER');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('NEW', 'MEETING_SET', 'PROPOSAL', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "AlertKind" AS ENUM ('RUNNER_OFFLINE', 'SESSION_EXPIRED', 'LINKEDIN_WARNING', 'LIMIT_REACHED', 'TEMPLATE_BLOCKED');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "privacyNoticeUrl" TEXT,
    "retentionMonths" INTEGER NOT NULL DEFAULT 12,
    "quietDays" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bannedPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "onboardingDone" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateTable
CREATE TABLE "LinkedinAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "profileUrl" TEXT,
    "premium" BOOLEAN NOT NULL DEFAULT false,
    "status" "AccountStatus" NOT NULL DEFAULT 'NEEDS_LOGIN',
    "weeklyInvites" INTEGER NOT NULL DEFAULT 180,
    "activeDays" INTEGER[] DEFAULT ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[],
    "windowStartMin" INTEGER NOT NULL DEFAULT 540,
    "windowEndMin" INTEGER NOT NULL DEFAULT 1110,
    "schedule" JSONB,
    "dailyMessageLimit" INTEGER NOT NULL DEFAULT 80,
    "inmailCredits" INTEGER,
    "externalInvites7d" INTEGER NOT NULL DEFAULT 0,
    "warmupEnabled" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3),
    "pausedUntil" TIMESTAMP(3),
    "runnerTokenHash" TEXT,
    "runnerLastSeenAt" TIMESTAMP(3),
    "runnerVersion" TEXT,
    "runnerPlatform" TEXT,
    "lastPlannedAt" TIMESTAMP(3),
    "lastWarning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkedinAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "linkedinAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "offerContext" TEXT NOT NULL,
    "tone" TEXT,
    "status" "AgentStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewMode" "ReviewMode" NOT NULL DEFAULT 'REVIEW_ALL',
    "budgetSharePct" INTEGER NOT NULL DEFAULT 100,
    "targeting" JSONB NOT NULL,
    "fitRule" TEXT,
    "bannedPhrases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "requiredLink" TEXT,
    "visitBeforeInvite" BOOLEAN NOT NULL DEFAULT true,
    "withdrawAfterDays" INTEGER NOT NULL DEFAULT 21,
    "maxPerCompany" INTEGER NOT NULL DEFAULT 2,
    "includeConnections" BOOLEAN NOT NULL DEFAULT true,
    "answers" JSONB,
    "firstLineEnabled" BOOLEAN NOT NULL DEFAULT false,
    "firstLineSources" TEXT[] DEFAULT ARRAY['mutual', 'post', 'school']::TEXT[],
    "calendarEnabled" BOOLEAN NOT NULL DEFAULT false,
    "calendarUrl" TEXT,
    "englishEnabled" BOOLEAN NOT NULL DEFAULT false,
    "openProfileEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inmailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inmailMinFitScore" INTEGER NOT NULL DEFAULT 80,
    "inmailWeeklyMax" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchRule" TEXT,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceStep" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "branch" "Branch" NOT NULL DEFAULT 'NEW_PERSON',
    "order" INTEGER NOT NULL,
    "type" "StepType" NOT NULL,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "attachmentId" TEXT,

    CONSTRAINT "SequenceStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetAccount" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TargetAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "segmentId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "body" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'A',
    "lang" TEXT NOT NULL DEFAULT 'tr',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateSuggestion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "proposed" TEXT NOT NULL,
    "rationale" TEXT,
    "accepted" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "linkedinUrl" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "title" TEXT,
    "company" TEXT,
    "location" TEXT,
    "headline" TEXT,
    "industry" TEXT,
    "degree" INTEGER,
    "mutualConnections" INTEGER,
    "recentlyActive" BOOLEAN NOT NULL DEFAULT false,
    "openProfile" BOOLEAN NOT NULL DEFAULT false,
    "lang" TEXT,
    "mutualName" TEXT,
    "sharedSchool" TEXT,
    "postTopic" TEXT,
    "cooldownUntil" TIMESTAMP(3),
    "source" "SourceKind" NOT NULL DEFAULT 'SEARCH',
    "retainUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProspect" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "segmentId" TEXT,
    "stage" "ProspectStage" NOT NULL DEFAULT 'QUEUED',
    "branch" "Branch" NOT NULL DEFAULT 'NEW_PERSON',
    "fitScore" INTEGER,
    "priority" INTEGER,
    "visitedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "fitReason" TEXT,
    "inviteSentAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3),
    "inmailSentAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "lang" TEXT NOT NULL DEFAULT 'tr',
    "replyLabel" "ReplyLabel",
    "skipReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentProspect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "agentId" TEXT,
    "stepId" TEXT,
    "templateId" TEXT,
    "direction" "Direction" NOT NULL,
    "body" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "providerMessageId" TEXT,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "linkedinAccountId" TEXT NOT NULL,
    "type" "JobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 10,
    "runAfter" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "agentProspectId" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "draftText" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "agentId" TEXT,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'NEW',
    "nextStep" TEXT,
    "nextStepAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "linkedinAccountId" TEXT,
    "kind" "AlertKind" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "undoData" JSONB,
    "undoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_workspaceId_email_key" ON "WorkspaceInvite"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "LinkedinAccount_workspaceId_idx" ON "LinkedinAccount"("workspaceId");

-- CreateIndex
CREATE INDEX "Agent_workspaceId_idx" ON "Agent"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SequenceStep_agentId_branch_order_key" ON "SequenceStep"("agentId", "branch", "order");

-- CreateIndex
CREATE UNIQUE INDEX "TargetAccount_agentId_name_key" ON "TargetAccount"("agentId", "name");

-- CreateIndex
CREATE INDEX "Template_stepId_segmentId_status_lang_idx" ON "Template"("stepId", "segmentId", "status", "lang");

-- CreateIndex
CREATE UNIQUE INDEX "Prospect_workspaceId_linkedinUrl_key" ON "Prospect"("workspaceId", "linkedinUrl");

-- CreateIndex
CREATE INDEX "AgentProspect_stage_idx" ON "AgentProspect"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "AgentProspect_agentId_prospectId_key" ON "AgentProspect"("agentId", "prospectId");

-- CreateIndex
CREATE INDEX "Message_prospectId_sentAt_idx" ON "Message"("prospectId", "sentAt");

-- CreateIndex
CREATE INDEX "Job_linkedinAccountId_status_runAfter_priority_idx" ON "Job"("linkedinAccountId", "status", "runAfter", "priority");

-- CreateIndex
CREATE INDEX "Job_agentProspectId_status_idx" ON "Job"("agentProspectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_workspaceId_kind_value_key" ON "Suppression"("workspaceId", "kind", "value");

-- CreateIndex
CREATE INDEX "Opportunity_workspaceId_stage_idx" ON "Opportunity"("workspaceId", "stage");

-- CreateIndex
CREATE INDEX "Note_prospectId_createdAt_idx" ON "Note"("prospectId", "createdAt");

-- CreateIndex
CREATE INDEX "Alert_workspaceId_resolvedAt_idx" ON "Alert"("workspaceId", "resolvedAt");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkedinAccount" ADD CONSTRAINT "LinkedinAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_linkedinAccountId_fkey" FOREIGN KEY ("linkedinAccountId") REFERENCES "LinkedinAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SequenceStep" ADD CONSTRAINT "SequenceStep_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetAccount" ADD CONSTRAINT "TargetAccount_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "SequenceStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "Segment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateSuggestion" ADD CONSTRAINT "TemplateSuggestion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProspect" ADD CONSTRAINT "AgentProspect_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProspect" ADD CONSTRAINT "AgentProspect_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_linkedinAccountId_fkey" FOREIGN KEY ("linkedinAccountId") REFERENCES "LinkedinAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suppression" ADD CONSTRAINT "Suppression_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_linkedinAccountId_fkey" FOREIGN KEY ("linkedinAccountId") REFERENCES "LinkedinAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Güvenlik: Supabase herkese açık API'si (anon/publishable anahtar) tablolara erişemesin.
-- Panel veritabanına doğrudan bağlanır ve bu kısıtlamadan etkilenmez.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;

-- Belgeler için özel (herkese kapalı) depolama alanı; Supabase dışındaki veritabanlarında atlanır
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'storage' AND table_name = 'buckets') THEN
    INSERT INTO storage.buckets (id, name, public) VALUES ('belgeler', 'belgeler', false) ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
