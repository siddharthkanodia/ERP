-- Remove legacy grams-based variant weight column.
ALTER TABLE "FinishedProductVariant"
DROP COLUMN IF EXISTS "weightInGrams";
