import dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import { PrismaClient, UserRole } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  const fullName = process.env.ADMIN_FULL_NAME?.trim() || 'FreshVend Administrator';

  if (!username || username.length < 3 || username.length > 50) {
    throw new Error('ADMIN_USERNAME must contain 3 to 50 characters');
  }
  if (!password || password.length < 8 || password.length > 72) {
    throw new Error('ADMIN_PASSWORD must contain 8 to 72 characters');
  }
  if (fullName.length > 100) {
    throw new Error('ADMIN_FULL_NAME must not exceed 100 characters');
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    await prisma.user.update({
      where: { id: existingUser.id },
      data: { role: UserRole.ADMIN, passwordHash, fullName },
    });
    console.log(`Admin account updated: ${username}`);
    return;
  }

  await prisma.user.create({
    data: { username, passwordHash, fullName, role: UserRole.ADMIN },
  });
  console.log(`Admin account created: ${username}`);
}

main()
  .catch((error: unknown) => {
    console.error('Admin seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
