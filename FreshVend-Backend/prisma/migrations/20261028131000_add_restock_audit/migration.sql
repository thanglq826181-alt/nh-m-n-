CREATE TABLE "RestockEvent" (
    "id" UUID NOT NULL,
    "machineId" UUID NOT NULL,
    "columnId" UUID NOT NULL,
    "operatorId" UUID,
    "quantity" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RestockEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RestockEvent_machineId_createdAt_idx" ON "RestockEvent"("machineId", "createdAt");
CREATE INDEX "RestockEvent_columnId_createdAt_idx" ON "RestockEvent"("columnId", "createdAt");
CREATE INDEX "RestockEvent_operatorId_idx" ON "RestockEvent"("operatorId");

ALTER TABLE "RestockEvent"
  ADD CONSTRAINT "RestockEvent_machineId_fkey"
  FOREIGN KEY ("machineId") REFERENCES "Machine"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestockEvent"
  ADD CONSTRAINT "RestockEvent_columnId_fkey"
  FOREIGN KEY ("columnId") REFERENCES "Column"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RestockEvent"
  ADD CONSTRAINT "RestockEvent_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
