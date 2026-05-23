-- CreateTable
CREATE TABLE "SilLoadRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "loadId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SilShipmentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "loadId" TEXT,
    "state" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SilCarrierRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "carrierId" TEXT NOT NULL,
    "carrierName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SilLaneRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "laneId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "equipment" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SilLoadPostingRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postingId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SilBidRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bidId" TEXT NOT NULL,
    "postingId" TEXT NOT NULL,
    "loadId" TEXT NOT NULL,
    "carrierId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bidRate" REAL NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SilMarketRateRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "observationId" TEXT NOT NULL,
    "laneId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "observedAt" DATETIME NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SilWorkflowEventRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "loadId" TEXT,
    "shipmentId" TEXT,
    "bidId" TEXT,
    "carrierId" TEXT,
    "occurredAt" DATETIME NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SilGovernanceSignalRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "signalId" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SilLeanTemplateRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SilLoadRecord_loadId_key" ON "SilLoadRecord"("loadId");

-- CreateIndex
CREATE INDEX "SilLoadRecord_customerId_idx" ON "SilLoadRecord"("customerId");

-- CreateIndex
CREATE INDEX "SilLoadRecord_status_idx" ON "SilLoadRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SilShipmentRecord_shipmentId_key" ON "SilShipmentRecord"("shipmentId");

-- CreateIndex
CREATE INDEX "SilShipmentRecord_loadId_idx" ON "SilShipmentRecord"("loadId");

-- CreateIndex
CREATE INDEX "SilShipmentRecord_state_idx" ON "SilShipmentRecord"("state");

-- CreateIndex
CREATE UNIQUE INDEX "SilCarrierRecord_carrierId_key" ON "SilCarrierRecord"("carrierId");

-- CreateIndex
CREATE INDEX "SilCarrierRecord_status_idx" ON "SilCarrierRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SilLaneRecord_laneId_key" ON "SilLaneRecord"("laneId");

-- CreateIndex
CREATE INDEX "SilLaneRecord_origin_destination_idx" ON "SilLaneRecord"("origin", "destination");

-- CreateIndex
CREATE UNIQUE INDEX "SilLoadPostingRecord_postingId_key" ON "SilLoadPostingRecord"("postingId");

-- CreateIndex
CREATE INDEX "SilLoadPostingRecord_loadId_idx" ON "SilLoadPostingRecord"("loadId");

-- CreateIndex
CREATE INDEX "SilLoadPostingRecord_status_idx" ON "SilLoadPostingRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SilBidRecord_bidId_key" ON "SilBidRecord"("bidId");

-- CreateIndex
CREATE INDEX "SilBidRecord_postingId_idx" ON "SilBidRecord"("postingId");

-- CreateIndex
CREATE INDEX "SilBidRecord_loadId_idx" ON "SilBidRecord"("loadId");

-- CreateIndex
CREATE INDEX "SilBidRecord_carrierId_idx" ON "SilBidRecord"("carrierId");

-- CreateIndex
CREATE INDEX "SilBidRecord_status_idx" ON "SilBidRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SilMarketRateRecord_observationId_key" ON "SilMarketRateRecord"("observationId");

-- CreateIndex
CREATE INDEX "SilMarketRateRecord_laneId_idx" ON "SilMarketRateRecord"("laneId");

-- CreateIndex
CREATE INDEX "SilMarketRateRecord_observedAt_idx" ON "SilMarketRateRecord"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "SilWorkflowEventRecord_eventId_key" ON "SilWorkflowEventRecord"("eventId");

-- CreateIndex
CREATE INDEX "SilWorkflowEventRecord_eventType_idx" ON "SilWorkflowEventRecord"("eventType");

-- CreateIndex
CREATE INDEX "SilWorkflowEventRecord_loadId_idx" ON "SilWorkflowEventRecord"("loadId");

-- CreateIndex
CREATE INDEX "SilWorkflowEventRecord_shipmentId_idx" ON "SilWorkflowEventRecord"("shipmentId");

-- CreateIndex
CREATE INDEX "SilWorkflowEventRecord_bidId_idx" ON "SilWorkflowEventRecord"("bidId");

-- CreateIndex
CREATE UNIQUE INDEX "SilGovernanceSignalRecord_signalId_key" ON "SilGovernanceSignalRecord"("signalId");

-- CreateIndex
CREATE INDEX "SilGovernanceSignalRecord_signalType_idx" ON "SilGovernanceSignalRecord"("signalType");

-- CreateIndex
CREATE INDEX "SilGovernanceSignalRecord_severity_idx" ON "SilGovernanceSignalRecord"("severity");

-- CreateIndex
CREATE INDEX "SilGovernanceSignalRecord_status_idx" ON "SilGovernanceSignalRecord"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SilLeanTemplateRecord_templateId_key" ON "SilLeanTemplateRecord"("templateId");

-- CreateIndex
CREATE INDEX "SilLeanTemplateRecord_category_idx" ON "SilLeanTemplateRecord"("category");
