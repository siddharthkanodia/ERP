import { hashPassword } from "../lib/auth";
import { prisma } from "../lib/prisma";

async function main() {
  const email = "kanodia.sid@gmail.com";
  const hashedPassword = await hashPassword("admin123");

  await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: "SUPER_ADMIN",
      companyId: null,
    },
    create: {
      email,
      name: "Super Admin",
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isActive: true,
      companyId: null,
    },
  });

  console.log("Super Admin seeded successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
