"use client";

import * as XLSX from "xlsx";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

export type RawMaterialInventoryRowForXLSX = {
  dateISO: string;
  opening: number;
  received: number;
  issued: number;
  closing: number;
};

function safeSheetName(name: string) {
  const trimmed = name.trim().slice(0, 31);
  return trimmed.replace(/[\[\]\*\/\\\?\:]/g, "-") || "Raw Material Report";
}

export function RawMaterialInventoryXLSXButton({
  rows,
  materialName,
  fromLabel,
  toLabel,
}: {
  rows: RawMaterialInventoryRowForXLSX[];
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
          Opening: Number(r.opening.toFixed(2)),
          Received: Number(r.received.toFixed(2)),
          Issued: Number(r.issued.toFixed(2)),
          Closing: Number(r.closing.toFixed(2)),
        }));

        const ws = XLSX.utils.json_to_sheet(data, {
          header: ["Date", "Opening", "Received", "Issued", "Closing"],
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName("Raw Material Report"));

        const safeMaterial =
          materialName.trim().replace(/\s+/g, "_").slice(0, 40) || "Material";
        const filename = `RawMaterials_${safeMaterial}_${fromLabel}-${toLabel}.xlsx`;

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
