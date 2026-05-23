-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sales_order_number" TEXT NOT NULL,
    "line_number" INTEGER NOT NULL,
    "item_number" TEXT NOT NULL,
    "item_description" TEXT NOT NULL,
    "quantity_requested" INTEGER NOT NULL,
    "quantity_allocated" INTEGER NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PickingTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "line_item_id" TEXT NOT NULL,
    "sales_order_number" TEXT NOT NULL,
    "quantity_picked" INTEGER NOT NULL,
    "lot_number" TEXT,
    "picked_by" TEXT NOT NULL,
    "picked_timestamp" DATETIME NOT NULL,
    "scanner_id" TEXT,
    "notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PickingTransaction_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "OrderLineItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "line_item_id" TEXT NOT NULL,
    "sales_order_number" TEXT NOT NULL,
    "quantity_verified" INTEGER NOT NULL,
    "lot_number" TEXT,
    "verified_by" TEXT NOT NULL,
    "verified_timestamp" DATETIME NOT NULL,
    "verification_status" TEXT NOT NULL DEFAULT 'passed',
    "variance_notes" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VerificationTransaction_line_item_id_fkey" FOREIGN KEY ("line_item_id") REFERENCES "OrderLineItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineItem_sales_order_number_line_number_key" ON "OrderLineItem"("sales_order_number", "line_number");
