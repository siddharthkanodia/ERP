"use client";

import * as XLSX from "xlsx";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export type FloorReportRowForXLSX = {
  dateISO: string;
  opening: number;
  issued: number;
  consumed: number;
  adjusted: number;
  closing: number;
};

function safeSheetName(name: string) {
  const trimmed = name.trim().slice(0, 31);
  return trimmed.replace(/[\[\]\*\/\\\?\:]/g, "-") || "Floor Report";
}

export function FloorReportXLSXButton({
  rows,
  materialName,
  fromLabel,
  toLabel,
}: {
  rows: FloorReportRowForXLSX[];
  materialName: string;
  fromLabel: string;
  toLabel: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 px-3"
      onClick={() => {
        if (rows.length === 0) return;

        const data = rows.map((r) => ({
          Date: r.dateISO,
          Opening: Number(r.opening.toFixed(3)),
          Issued: Number(r.issued.toFixed(3)),
          Consumed: Number(r.consumed.toFixed(3)),
          Adjusted: Number(r.adjusted.toFixed(3)),
          Closing: Number(r.closing.toFixed(3)),
        }));

        const ws = XLSX.utils.json_to_sheet(data, {
          header: ["Date", "Opening", "Issued", "Consumed", "Adjusted", "Closing"],
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName("Floor Report"));

        const safeName =
          materialName.trim().replace(/\s+/g, "_").slice(0, 40) || "Material";
        const filename = `ProductionFloor_${safeName}_${fromLabel}-${toLabel}.xlsx`;

        XLSX.writeFile(wb, filename, { bookType: "xlsx" });
      }}
    >
      <Download className="mr-1 size-4" />
      Download XLSX
    </Button>
  );
}
