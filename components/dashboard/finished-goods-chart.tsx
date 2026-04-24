"use client";

import { Fragment, useState } from "react";
import { Tooltip } from "radix-ui";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

import { ChartCard } from "@/components/dashboard/chart-card";

export type FinishedGoodVariant = {
  name: string;
  quantityInStock: number;
};

export type FinishedGoodRow = {
  id: string;
  name: string;
  unit: string;
  quantityInStock: number;
  variants: FinishedGoodVariant[];
};

function unitLabel(unit: string) {
  return unit === "PIECE" ? "pcs" : "kg";
}

type TableRow = {
  product: FinishedGoodRow;
  hasVariants: boolean;
  totalQty: number;
  inStockVariants: FinishedGoodVariant[];
};

function buildTableRows(data: FinishedGoodRow[]): TableRow[] {
  const rows: TableRow[] = [];
  for (const product of data) {
    const hasVariants = product.variants.length > 0;
    if (hasVariants) {
      const inStockVariants = product.variants.filter(
        (v) => v.quantityInStock > 0
      );
      if (inStockVariants.length === 0) continue;
      const totalQty = inStockVariants.reduce(
        (sum, v) => sum + v.quantityInStock,
        0
      );
      rows.push({ product, hasVariants: true, totalQty, inStockVariants });
    } else {
      if (product.quantityInStock <= 0) continue;
      rows.push({
        product,
        hasVariants: false,
        totalQty: product.quantityInStock,
        inStockVariants: [],
      });
    }
  }
  return rows;
}

export function FinishedGoodsChart({ data }: { data: FinishedGoodRow[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const tableRows = buildTableRows(data);

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const action = (
    <Tooltip.Provider delayDuration={150}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            aria-label="Info"
            className="inline-flex size-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-foreground"
          >
            <Info className="size-4" />
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            side="left"
            sideOffset={6}
            className="z-50 max-w-xs rounded-md border bg-white px-3 py-2 text-xs text-zinc-700 shadow-md"
          >
            Any variant not in stock is not shown
            <Tooltip.Arrow className="fill-white" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );

  return (
    <ChartCard title="Finished Goods Inventory" action={action}>
      {data.length === 0 ? (
        <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
          No finished products yet.
        </div>
      ) : (
        <div className="h-72 w-full overflow-auto">
          {tableRows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No products currently in stock.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="border-b px-2 py-2 font-medium">Finished Good</th>
                  <th className="border-b px-2 py-2 text-right font-medium">
                    Qty in Stock
                  </th>
                  <th className="border-b px-2 py-2 text-right font-medium">
                    Unit
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const isExpanded = expanded.has(row.product.id);
                  return (
                    <Fragment key={row.product.id}>
                      <tr className="border-b last:border-b-0">
                        <td
                          className="px-2 py-2 text-foreground"
                          title={row.product.name}
                        >
                          {row.hasVariants ? (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(row.product.id)}
                              aria-expanded={isExpanded}
                              aria-label={
                                isExpanded
                                  ? `Collapse ${row.product.name}`
                                  : `Expand ${row.product.name}`
                              }
                              className="inline-flex items-center gap-1.5 rounded-sm text-left transition-colors hover:text-zinc-900"
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4 shrink-0 text-zinc-500" />
                              ) : (
                                <ChevronRight className="size-4 shrink-0 text-zinc-500" />
                              )}
                              <span>{row.product.name}</span>
                            </button>
                          ) : (
                            <span className="inline-flex items-center">
                              {row.product.name}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-zinc-700">
                          {row.totalQty.toFixed(2)}
                        </td>
                        <td className="px-2 py-2 text-right text-zinc-700">
                          {unitLabel(row.product.unit)}
                        </td>
                      </tr>

                      {row.hasVariants && isExpanded
                        ? row.inStockVariants.map((variant, index) => (
                            <tr
                              key={`${row.product.id}-${variant.name}-${index}`}
                              className="border-b bg-zinc-50 last:border-b-0"
                            >
                              <td className="px-2 py-1.5 pl-8 text-zinc-700">
                                {variant.name}
                              </td>
                              <td className="px-2 py-1.5 text-right tabular-nums text-zinc-700">
                                {variant.quantityInStock.toFixed(2)}
                              </td>
                              <td className="px-2 py-1.5 text-right text-zinc-700">
                                {unitLabel(row.product.unit)}
                              </td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </ChartCard>
  );
}
