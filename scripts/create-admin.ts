import { hashPassword } from "../lib/auth";
import { prisma } from "../lib/prisma";

async function main() {
  const company = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
  });

  if (!company) {
    console.error("No company found. Cannot create admin user.");
    process.exit(1);
  }

  const hashedPassword = await hashPassword("password123");

  await prisma.user.upsert({
    where: { email: "admin@test.com" },
    update: {
      name: "Admin",
      password: hashedPassword,
      role: "ADMIN",
      isActive: true,
      companyId: company.id,
    },
    create: {
      email: "admin@test.com",
      name: "Admin",
      password: hashedPassword,
      role: "ADMIN",
      isActive: true,
      companyId: company.id,
    },
  });

  console.log(`Admin user created successfully for company: ${company.name}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
