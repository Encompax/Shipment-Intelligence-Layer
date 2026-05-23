-- CreateTable
CREATE TABLE "Job" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dataSourceId" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jobId" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Upload_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PickingTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "picking_ticket_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "item_number" TEXT NOT NULL,
    "item_description" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "quantity_to_pick" INTEGER NOT NULL,
    "quantity_picked" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "assigned_to" TEXT,
    "assigned_time" DATETIME,
    "scanned_timestamp" DATETIME,
    "scanner_id" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "LotTrackingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "item_number" TEXT NOT NULL,
    "item_description" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "quantity_total" INTEGER NOT NULL,
    "quantity_picked" INTEGER NOT NULL,
    "quantity_available" INTEGER NOT NULL,
    "location" TEXT NOT NULL,
    "received_date" DATETIME NOT NULL,
    "expiration_date" DATETIME NOT NULL,
    "is_sysmex" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'available',
    "order_reference" TEXT,
    "production_date" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShipmentCarrier" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipment_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "carrier_name" TEXT NOT NULL,
    "service_type" TEXT NOT NULL,
    "tracking_number" TEXT,
    "weight_lbs" REAL NOT NULL,
    "cost" REAL NOT NULL,
    "on_time_delivery" BOOLEAN,
    "actual_delivery_date" DATETIME,
    "estimated_delivery" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "exception_code" TEXT,
    "exception_message" TEXT,
    "ship_date" DATETIME NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "QCApproval" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batch_number" TEXT NOT NULL,
    "item_number" TEXT NOT NULL,
    "item_description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "production_date" DATETIME NOT NULL,
    "received_quarantine_date" DATETIME NOT NULL,
    "inspected_status" TEXT NOT NULL DEFAULT 'pending',
    "inspected_by" TEXT,
    "inspected_date" DATETIME,
    "qc_verified_status" TEXT NOT NULL DEFAULT 'pending',
    "qc_verified_by" TEXT,
    "qc_verified_date" DATETIME,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "StagingItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order_id" TEXT NOT NULL,
    "order_source" TEXT NOT NULL,
    "item_number" TEXT NOT NULL,
    "item_description" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "quantity_ordered" INTEGER NOT NULL,
    "quantity_staged" INTEGER NOT NULL,
    "picking_ticket_id" TEXT NOT NULL,
    "staged_time" DATETIME NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" TEXT,
    "verified_time" DATETIME,
    "picked_by" TEXT NOT NULL,
    "carrier" TEXT,
    "customer_name" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Datasource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "endpointUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Datasource" ("createdAt", "description", "id", "name", "type", "updatedAt") SELECT "createdAt", "description", "id", "name", "type", "updatedAt" FROM "Datasource";
DROP TABLE "Datasource";
ALTER TABLE "new_Datasource" RENAME TO "Datasource";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PickingTicket_picking_ticket_id_key" ON "PickingTicket"("picking_ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "LotTrackingItem_lot_number_key" ON "LotTrackingItem"("lot_number");

-- CreateIndex
CREATE UNIQUE INDEX "ShipmentCarrier_shipment_id_key" ON "ShipmentCarrier"("shipment_id");

-- CreateIndex
CREATE UNIQUE INDEX "QCApproval_batch_number_key" ON "QCApproval"("batch_number");
