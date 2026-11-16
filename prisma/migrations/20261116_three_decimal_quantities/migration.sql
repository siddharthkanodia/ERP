-- AlterTable
ALTER TABLE "FinishedProduct" ALTER COLUMN "quantityInStock" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "lastDispatchedQuantity" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "FinishedProductLedger" ALTER COLUMN "openingBalance" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "quantityProduced" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "quantityDispatched" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "closingBalance" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "FinishedProductVariant" ALTER COLUMN "quantityInStock" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "ProductionEntry" ALTER COLUMN "quantityProduced" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "ProductionFloorLedger" ALTER COLUMN "openingBalance" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "quantityIn" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "quantityOut" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "closingBalance" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "ProductionFloorStock" ALTER COLUMN "quantityInStock" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "RawMaterial" ALTER COLUMN "quantityInStock" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "lastReceivedQuantity" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "RawMaterialLedger" ALTER COLUMN "openingBalance" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "quantityIn" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "quantityOut" SET DATA TYPE DECIMAL(12,3),
ALTER COLUMN "closingBalance" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "WorkOrder" ALTER COLUMN "plannedQuantity" SET DATA TYPE DECIMAL(12,3);

-- AlterTable
ALTER TABLE "WorkOrderRawMaterial" ALTER COLUMN "quantityIssued" SET DATA TYPE DECIMAL(12,3);

