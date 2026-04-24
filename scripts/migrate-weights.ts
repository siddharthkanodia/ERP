import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function migrateWeights() {
  console.log("Starting one-time weight migration...");

  const variantCount = await prisma.finishedProductVariant.count();
  console.log(
    `Found ${variantCount} finished product variants. No DB writes are needed because weights are now stored directly in kg.`
  );

  const pieceProducts = await prisma.finishedProduct.findMany({
    where: { unit: "PIECE" },
    select: {
      id: true,
      name: true,
      weightPerPiece: true,
      variants: {
        where: { isDeleted: false },
        select: { id: true },
      },
    },
  });

  const pieceProductsWithoutVariants = pieceProducts.filter(
    (product) => product.variants.length === 0
  );

  const invalidProducts = pieceProductsWithoutVariants.filter((product) => {
    if (product.weightPerPiece == null) return true;
    const value = Number(product.weightPerPiece);
    return !Number.isFinite(value) || value <= 0;
  });

  if (invalidProducts.length === 0) {
    console.log(
      `Verification passed: ${pieceProductsWithoutVariants.length} PIECE products without variants have weightPerPiece set.`
    );
  } else {
    console.warn(
      `Verification warning: ${invalidProducts.length} PIECE products without variants are missing/invalid weightPerPiece.`
    );
    for (const product of invalidProducts) {
      console.warn(`- ${product.id} (${product.name})`);
    }
  }

  console.log("Weight migration completed.");
}

migrateWeights()
  .catch((error) => {
    console.error("Weight migration failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
