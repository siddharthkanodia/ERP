import { CompanyRole, GlobalRole, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPANY_SEED_ID = "seed-company-sme-erp-demo";
const SUPABASE_USER_ID = "60eac251-bd03-4223-ac81-a76493c8b641";
const USER_EMAIL = "kanodia.sid@gmail.com";

async function main() {
  const company = await prisma.company.upsert({
    where: { id: COMPANY_SEED_ID },
    update: {
      name: "SME ERP Demo",
      isActive: true,
    },
    create: {
      id: COMPANY_SEED_ID,
      name: "SME ERP Demo",
      isActive: true,
    },
  });
  console.log(`✅ Company created: ${company.id}`);

  const user = await prisma.user.upsert({
    where: { supabaseUserId: SUPABASE_USER_ID },
    update: {
      email: USER_EMAIL,
      globalRole: GlobalRole.SUPER_ADMIN,
      isActive: true,
    },
    create: {
      email: USER_EMAIL,
      supabaseUserId: SUPABASE_USER_ID,
      globalRole: GlobalRole.SUPER_ADMIN,
      isActive: true,
    },
  });
  console.log(`✅ User created: ${user.id}`);

  const membership = await prisma.companyMembership.upsert({
    where: {
      companyId_userId: { companyId: company.id, userId: user.id },
    },
    update: {
      role: CompanyRole.ADMIN,
    },
    create: {
      companyId: company.id,
      userId: user.id,
      role: CompanyRole.ADMIN,
    },
  });
  console.log(`✅ Membership created: ${membership.id}`);

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
