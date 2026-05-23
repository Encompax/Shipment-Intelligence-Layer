-- CreateTable
CREATE TABLE "SilWorkspaceRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "ownerEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SilWorkspaceRecord_workspaceId_key" ON "SilWorkspaceRecord"("workspaceId");

-- CreateIndex
CREATE INDEX "SilWorkspaceRecord_organization_idx" ON "SilWorkspaceRecord"("organization");

-- CreateIndex
CREATE INDEX "SilWorkspaceRecord_status_idx" ON "SilWorkspaceRecord"("status");
