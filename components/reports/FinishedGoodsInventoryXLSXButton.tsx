"use client";

import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";

export type FinishedGoodsInventoryRowForXLSX = {
  dateISO: string; // YYYY-MM-DD
  opening: number;
  production: number;
  dispatched: number;
  closing: number;
};

function safeSheetName(name: string) {
  const trimmed = name.trim().slice(0, 31);
  return trimmed.replace(/[\[\]\*\/\\\?\:]/g, "-") || "Inventory Report";
}

export function FinishedGoodsInventoryXLSXButton({
  rows,
  productName,
  fromLabel,
  toLabel,
}: {
  rows: FinishedGoodsInventoryRowForXLSX[];
  productName: string;
  fromLabel: string; // e.g. Mar2026
  toLabel: string; // e.g. Apr2026
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
          Production: Number(r.production.toFixed(2)),
          Dispatched: Number(r.dispatched.toFixed(2)),
          Closing: Number(r.closing.toFixed(2)),
        }));

        const ws = XLSX.utils.json_to_sheet(data, {
          header: ["Date", "Opening", "Production", "Dispatched", "Closing"],
        });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, safeSheetName("Inventory Report"));

        const safeProduct = productName.trim().replace(/\s+/g, "_").slice(0, 40) || "Product";
        const filename = `FinishedGoods_${safeProduct}_${fromLabel}-${toLabel}.xlsx`;

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

