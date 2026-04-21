"use client";

import * as XLSX from "xlsx";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export type WasteInventoryRowForXLSX = {
  dateISO: string;
  opening: number;
  added: number;
  dispatched: number;
  closing: number;
};

function safeSheetName(name: string) {
  const trimmed = name.trim().slice(0, 31);
  return trimmed.replace(/[\[\]\*\/\\\?\:]/g, "-") || "Waste Report";
}

export function WasteInventoryXLSXButton({
  rows,
  wasteTypeName,
  fromLabel,
  toLabel,
}: {
  rows: WasteInventoryRowForXLSX[];
  wasteTypeName: string;
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
          Opening: Number(r.opening.toFixed(2)),
          Added: Number(r.added.toFixed(2)),
          Dispatched: Number(r.dispatched.toFixed(2)),
          Closing: Number(r.closing.toFixed(2)),
        }));

        const ws = XLSX.utils.json_to_sheet(data, {
          header: ["Date", "Opening", "Added", "Dispatched", "Closing"],
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName("Waste Report"));

        const safeName =
          wasteTypeName.trim().replace(/\s+/g, "_").slice(0, 40) || "Waste";
        const filename = `Waste_${safeName}_${fromLabel}-${toLabel}.xlsx`;

        XLSX.writeFile(wb, filename, {
          bookType: "xlsx",
        });
      }}
    >
      <Download className="mr-1 size-4" />
      Download XLSX
    </Button>
  );
}
