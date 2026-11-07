-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "notifyEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "notifyEvents" TEXT[] DEFAULT ARRAY['replied', 'interested', 'error']::TEXT[],
ADD COLUMN     "notifyLastAt" TIMESTAMP(3),
ADD COLUMN     "notifyLastStatus" TEXT;
