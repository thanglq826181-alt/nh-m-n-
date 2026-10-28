-- Add a failed-payment state while preserving existing transaction values.
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

ALTER TABLE "Transaction" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "Transaction"
  ALTER COLUMN "paymentStatus" TYPE "PaymentStatus_new"
  USING ("paymentStatus"::text::"PaymentStatus_new");

ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "PaymentStatus_old";

ALTER TABLE "Transaction" ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';
ALTER TABLE "Transaction" ADD COLUMN "customerId" UUID;

CREATE INDEX "Transaction_customerId_idx" ON "Transaction"("customerId");

ALTER TABLE "Transaction"
  ADD CONSTRAINT "Transaction_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
