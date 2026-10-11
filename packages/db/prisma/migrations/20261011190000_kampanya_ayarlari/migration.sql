-- CreateEnum
CREATE TYPE "UncertainPolicy" AS ENUM ('ASK', 'DROP', 'ACCEPT_STRONG');

-- CreateEnum
CREATE TYPE "AgentMode" AS ENUM ('FIND_AND_OUTREACH', 'FIND_ONLY');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "mode" "AgentMode" NOT NULL DEFAULT 'FIND_AND_OUTREACH',
ADD COLUMN     "preferredKeywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "skipOpenToWork" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "uncertainPolicy" "UncertainPolicy" NOT NULL DEFAULT 'ASK',
ADD COLUMN     "webhookEvents" TEXT[] DEFAULT ARRAY['replied']::TEXT[],
ADD COLUMN     "webhookLastAt" TIMESTAMP(3),
ADD COLUMN     "webhookLastStatus" TEXT,
ADD COLUMN     "webhookSecret" TEXT,
ADD COLUMN     "webhookUrl" TEXT,
ADD COLUMN     "windowDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "windowEndMin" INTEGER,
ADD COLUMN     "windowStartMin" INTEGER;

-- AlterTable
ALTER TABLE "LinkedinAccount" ADD COLUMN     "autoWithdraw" BOOLEAN NOT NULL DEFAULT true;
