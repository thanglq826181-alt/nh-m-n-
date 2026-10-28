ALTER TABLE "Machine" ADD COLUMN "deviceKeyHash" VARCHAR(64);
CREATE UNIQUE INDEX "Machine_deviceKeyHash_key" ON "Machine"("deviceKeyHash");

CREATE TABLE "InventoryBatch" (
    "id" UUID NOT NULL,
    "columnId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryBatch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryBatch_columnId_createdAt_idx" ON "InventoryBatch"("columnId", "createdAt");
CREATE INDEX "InventoryBatch_expiryDate_idx" ON "InventoryBatch"("expiryDate");

ALTER TABLE "InventoryBatch"
  ADD CONSTRAINT "InventoryBatch_columnId_fkey"
  FOREIGN KEY ("columnId") REFERENCES "Column"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve existing stock as one opening inventory batch per non-empty column.
INSERT INTO "InventoryBatch" ("id", "columnId", "quantity", "expiryDate", "createdAt")
SELECT
  (substr(hash, 1, 8) || '-' || substr(hash, 9, 4) || '-' || substr(hash, 13, 4) || '-' || substr(hash, 17, 4) || '-' || substr(hash, 21, 12))::uuid,
  "id",
  "currentStock",
  "expiryDate",
  CURRENT_TIMESTAMP
FROM (
  SELECT "id", "currentStock", "expiryDate", md5("id"::text) AS hash
  FROM "Column"
  WHERE "currentStock" > 0
) AS existing_columns;
