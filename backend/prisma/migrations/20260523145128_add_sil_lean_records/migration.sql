-- CreateTable
CREATE TABLE "SilLeanRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "program" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SilLeanRecord_recordId_key" ON "SilLeanRecord"("recordId");

-- CreateIndex
CREATE INDEX "SilLeanRecord_templateId_idx" ON "SilLeanRecord"("templateId");

-- CreateIndex
CREATE INDEX "SilLeanRecord_organization_idx" ON "SilLeanRecord"("organization");

-- CreateIndex
CREATE INDEX "SilLeanRecord_status_idx" ON "SilLeanRecord"("status");
