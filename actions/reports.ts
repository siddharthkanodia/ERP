"use server";

import {
  getFinishedGoodsReportRange,
  getRawMaterialReport,
  type FinishedGoodsReportRangeInput,
  type RawMaterialReportRangeInput,
} from "@/lib/reports/queries";

export async function fetchFinishedGoodsInventoryReport(
  input: FinishedGoodsReportRangeInput
) {
  return getFinishedGoodsReportRange(input);
}

export async function fetchRawMaterialInventoryReport(
  input: RawMaterialReportRangeInput
) {
  return getRawMaterialReport(
    Number(input.fromMonth),
    Number(input.fromYear),
    Number(input.toMonth),
    Number(input.toYear),
    input.materialId
  );
}
