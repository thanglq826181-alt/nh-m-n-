-- Recreate the enum so the new value can be used as a column default
-- within this migration transaction on PostgreSQL.
CREATE TYPE "UserRole_new" AS ENUM ('ADMIN', 'OPERATOR', 'CUSTOMER');

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "UserRole_new"
  USING ("role"::text::"UserRole_new");

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "UserRole_old";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';
