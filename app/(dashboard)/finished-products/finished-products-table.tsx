"use client";

import Link from "next/link";
import { format } from "date-fns";
import { ChevronRight, Pencil, ScrollText } from "lucide-react";
import { Fragment, useState } from "react";
import { DeleteProductButton } from "@/components/finished-products/DeleteProductButton";

type ProductRow = {
  id: string;
  name: string;
  unit: "KG" | "PIECE";
  isDeleted?: boolean;
  aggregateStock: number;
  weightPerPiece: number | null;
  lastDispatchedAt: Date | string | null;
  lastDispatchedQuantity: number | null;
  variants: Array<{
    id: string;
    name: string;
    weightInGrams: number;
    quantityInStock: number;
  }>;
};

export function FinishedProductsTable({
  finishedProducts,
}: {
  finishedProducts: ProductRow[];
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="overflow-x-auto rounded-md border bg-card">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-2 font-medium text-foreground">Name</th>
            <th className="px-3 py-2 text-right font-medium text-foreground">
              Quantity in stock(kg)
            </th>
            <th className="px-3 py-2 text-right font-medium text-foreground">
              Quantity in stock(pieces)
            </th>
            <th className="px-3 py-2 text-right font-medium text-foreground">
              Weight / piece
            </th>
            <th className="px-3 py-2 font-medium text-foreground">
              Last Dispatched
            </th>
            <th className="px-3 py-2 text-right font-medium text-foreground">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {finishedProducts.filter((p) => p.isDeleted !== true).map((product) => {
            const hasVariants = product.variants.length > 0;
            const isExpanded = expanded[product.id] === true;
            const lastDispatched = product.lastDispatchedAt
              ? `${format(new Date(product.lastDispatchedAt), "dd MMM yyyy")} (${
                  product.lastDispatchedQuantity?.toString() ?? "-"
                } ${product.unit === "PIECE" ? "pcs" : "kg"})`
              : "Never";

            return (
              <Fragment key={product.id}>
                <tr
                  className="border-b last:border-b-0 hover:bg-muted/30"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {hasVariants ? (
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((prev) => ({
                              ...prev,
                              [product.id]: !prev[product.id],
                            }))
                          }
                          className="inline-flex items-center"
                          aria-label={
                            isExpanded ? "Collapse variants" : "Expand variants"
                          }
                        >
                          <ChevronRight
                            className={`size-4 text-muted-foreground transition-transform ${
                              isExpanded ? "rotate-90" : ""
                            }`}
                          />
                        </button>
                      ) : null}
                      <Link
                        href={`/finished-products/${product.id}/ledger`}
                        className="cursor-pointer hover:underline"
                      >
                        {product.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {product.unit === "KG" ? product.aggregateStock.toString() : "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {product.unit === "PIECE"
                      ? product.aggregateStock.toString()
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {product.unit === "PIECE" &&
                    product.variants.length === 0 &&
                    product.weightPerPiece != null
                      ? `${product.weightPerPiece.toFixed(2)} g / piece`
                      : "-"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {lastDispatched}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/finished-products/${product.id}/ledger`}
                        title="View Consolidated Ledger"
                        className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-2 text-black transition-colors hover:bg-muted"
                      >
                        <ScrollText className="size-4" />
                      </Link>
                      <Link
                        href={`/finished-products/${product.id}/edit`}
                        className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-2 text-black transition-colors hover:bg-muted"
                      >
                        <Pencil className="size-4" />
                      </Link>
                      <DeleteProductButton
                        productId={product.id}
                        productName={product.name}
                        aggregateStock={product.aggregateStock}
                        unit={product.unit === "PIECE" ? "pcs" : "kg"}
                      />
                    </div>
                  </td>
                </tr>

                {hasVariants && isExpanded ? (
                  <tr className="border-b last:border-b-0">
                    <td colSpan={5} className="p-0">
                      <div className="border-t bg-muted/20 px-3 py-2">
                        <div className="overflow-x-auto rounded-md border bg-card">
                          <table className="min-w-full border-collapse text-sm">
                            <thead>
                              <tr className="border-b bg-muted/40 text-left">
                                <th className="px-3 py-2 font-medium text-foreground">
                                  Variant Name
                                </th>
                                <th className="px-3 py-2 text-right font-medium text-foreground">
                                  Weight (grams)
                                </th>
                                <th className="px-3 py-2 text-right font-medium text-foreground">
                                  Stock
                                </th>
                                <th className="px-3 py-2 text-right font-medium text-foreground">
                                  Ledger Link
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {product.variants.map((variant) => (
                                <tr
                                  key={variant.id}
                                  className="border-b last:border-b-0 hover:bg-muted/30"
                                >
                                  <td className="px-3 py-2">{variant.name}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {variant.weightInGrams}
                                  </td>
                                  <td className="px-3 py-2 text-right tabular-nums">
                                    {variant.quantityInStock}{" "}
                                    {product.unit === "PIECE" ? "pcs" : "kg"}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    <Link
                                      href={`/finished-products/${product.id}/ledger?variantId=${variant.id}`}
                                      className="text-sm font-medium text-black underline-offset-4 hover:underline"
                                    >
                                      View Ledger
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
