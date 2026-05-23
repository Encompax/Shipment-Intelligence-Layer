-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "item_number" TEXT NOT NULL,
    "item_description" TEXT NOT NULL,
    "lot_number" TEXT NOT NULL,
    "quantity_moved" INTEGER NOT NULL,
    "from_location" TEXT NOT NULL,
    "to_location" TEXT NOT NULL,
    "from_bin" TEXT,
    "to_bin" TEXT,
    "moved_by" TEXT NOT NULL,
    "moved_timestamp" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "unit_of_measure" TEXT NOT NULL,
    "transaction_status" TEXT NOT NULL DEFAULT 'success',
    "panatracker_ref" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "InventoryMovement_item_number_idx" ON "InventoryMovement"("item_number");

-- CreateIndex
CREATE INDEX "InventoryMovement_lot_number_idx" ON "InventoryMovement"("lot_number");

-- CreateIndex
CREATE INDEX "InventoryMovement_from_location_idx" ON "InventoryMovement"("from_location");

-- CreateIndex
CREATE INDEX "InventoryMovement_to_location_idx" ON "InventoryMovement"("to_location");

-- CreateIndex
CREATE INDEX "InventoryMovement_moved_timestamp_idx" ON "InventoryMovement"("moved_timestamp");
