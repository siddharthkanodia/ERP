import bcrypt from "bcryptjs";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const firstCompany = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!firstCompany) {
    throw new Error("No company found in database. Seed requires at least one company.");
  }

  const hashedPassword = await bcrypt.hash("password123", 10);

  const user = await prisma.user.upsert({
    where: { email: "admin@test.com" },
    update: {
      name: "Admin",
      password: hashedPassword,
      role: UserRole.ADMIN,
      isActive: true,
      companyId: firstCompany.id,
    },
    create: {
      name: "Admin",
      email: "admin@test.com",
      password: hashedPassword,
      role: UserRole.ADMIN,
      isActive: true,
      companyId: firstCompany.id,
    },
  });
  console.log(`✅ Admin user seeded: ${user.email}`);

  console.log("🌱 Seed complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
