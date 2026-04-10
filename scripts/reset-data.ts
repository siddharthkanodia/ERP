import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function clearModel(name: string, action: () => Promise<unknown>) {
  console.log(`- Clearing ${name}...`);
  await action();
  console.log(`  ✓ Cleared ${name}`);
}

async function resetData() {
  console.log("🗑️  Clearing all data...");

  // Child tables first (FK-dependent), parent tables last.
  await clearModel("Attendance", () => prisma.attendance.deleteMany({}));
  await clearModel("Leave", () => prisma.leave.deleteMany({}));

  await clearModel("ProductionEntry", () => prisma.productionEntry.deleteMany({}));
  await clearModel("WorkOrderRawMaterial", () =>
    prisma.workOrderRawMaterial.deleteMany({})
  );

  await clearModel("FinishedProductLedger", () =>
    prisma.finishedProductLedger.deleteMany({})
  );
  await clearModel("RawMaterialLedger", () => prisma.rawMaterialLedger.deleteMany({}));

  await clearModel("WorkOrder", () => prisma.workOrder.deleteMany({}));
  await clearModel("FinishedProductVariant", () =>
    prisma.finishedProductVariant.deleteMany({})
  );

  await clearModel("Employee", () => prisma.employee.deleteMany({}));
  await clearModel("Department", () => prisma.department.deleteMany({}));

  await clearModel("FinishedProduct", () => prisma.finishedProduct.deleteMany({}));
  await clearModel("RawMaterial", () => prisma.rawMaterial.deleteMany({}));

  console.log("✅ All data cleared successfully");
}

resetData()
  .catch((error) => {
    console.error("❌ Failed to clear data:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

