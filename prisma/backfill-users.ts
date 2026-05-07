import { PrismaClient, UserRole } from "@prisma/client";

import { hashPassword } from "../lib/auth";

const prisma = new PrismaClient();

async function main() {
  const missingUsers = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM "User"
    WHERE name IS NULL OR password IS NULL
  `;

  if (missingUsers.length === 0) {
    console.log("No users require backfill.");
    return;
  }

  const hashedPassword = await hashPassword("password123");
  const ids = missingUsers.map((user) => user.id);

  const result = await prisma.user.updateMany({
    where: {
      id: { in: ids },
    },
    data: {
      name: "Admin",
      password: hashedPassword,
      role: UserRole.ADMIN,
      isActive: true,
    },
  });

  console.log(`Backfilled ${result.count} user(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
