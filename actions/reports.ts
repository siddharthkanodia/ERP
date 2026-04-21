"use server";

import { getAuthSession } from "@/lib/auth";
import {
  getFinishedGoodsReportRange,
  getRawMaterialReport,
  type FinishedGoodsReportRangeInput,
  type RawMaterialReportRangeInput,
} from "@/lib/reports/queries";

export async function fetchFinishedGoodsInventoryReport(
  input: FinishedGoodsReportRangeInput
) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");

  return getFinishedGoodsReportRange(input);
}

export async function fetchRawMaterialInventoryReport(
  input: RawMaterialReportRangeInput
) {
  const session = await getAuthSession();
  if (!session?.companyId) throw new Error("Unauthorized");

  return getRawMaterialReport(
    Number(input.fromMonth),
    Number(input.fromYear),
    Number(input.toMonth),
    Number(input.toYear),
    input.materialId
  );
}
