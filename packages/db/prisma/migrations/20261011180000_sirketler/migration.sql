-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "companyId" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_workspaceId_name_key" ON "Company"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Agent_companyId_idx" ON "Agent"("companyId");

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Güvenlik: yeni tablo da herkese açık API'den kapalı olsun
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;

-- Var olan kampanyalar için çalışma alanı adıyla bir şirket aç ve bağla
INSERT INTO "Company" ("id", "workspaceId", "name")
SELECT 'c' || substr(md5(w."id"), 1, 24), w."id", 'HeAlthFintel'
FROM "Workspace" w WHERE EXISTS (SELECT 1 FROM "Agent" a WHERE a."workspaceId" = w."id");
UPDATE "Agent" a SET "companyId" = 'c' || substr(md5(a."workspaceId"), 1, 24) WHERE a."companyId" IS NULL;
