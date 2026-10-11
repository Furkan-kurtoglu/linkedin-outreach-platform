-- AlterTable
ALTER TABLE "TargetAccount" ADD COLUMN "lastSearchedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Institution" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rawName" TEXT,
    "kind" TEXT NOT NULL,
    "city" TEXT,
    "district" TEXT,
    "orgType" TEXT,
    "size" TEXT,
    "website" TEXT,
    "linkedinUrl" TEXT,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Institution_workspaceId_kind_idx" ON "Institution"("workspaceId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Institution_workspaceId_key_key" ON "Institution"("workspaceId", "key");

-- AddForeignKey
ALTER TABLE "Institution" ADD CONSTRAINT "Institution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Güvenlik: yeni tablo da herkese açık API'den kapalı olsun
ALTER TABLE "Institution" ENABLE ROW LEVEL SECURITY;

-- "Acıbadem" hariç kuralı Bupa Acıbadem Sigorta'yı da eliyordu; sigortacı hariç tutulmasın
UPDATE "Suppression" s SET "value" = 'Acıbadem -Bupa'
WHERE s."kind" = 'company' AND s."value" = 'Acıbadem'
  AND NOT EXISTS (SELECT 1 FROM "Suppression" x WHERE x."workspaceId" = s."workspaceId" AND x."kind" = 'company' AND x."value" = 'Acıbadem -Bupa');
