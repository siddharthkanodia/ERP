import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getFinishedProductById,
  getFinishedProductVariants,
} from "@/actions/finished-products";

import { EditFinishedProductForm } from "./finished-product-edit-form";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditFinishedProductPage({ params }: PageProps) {
  const { id } = await params;
  const [product, variants] = await Promise.all([
    getFinishedProductById(id),
    getFinishedProductVariants(id),
  ]);

  if (!product) {
    return (
      <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
        <header className="mb-5">
          <h1 className="text-xl font-semibold tracking-tight">
            Edit Finished Product
          </h1>
        </header>
        <div className="rounded-md border bg-card p-4">
          <p className="text-sm text-muted-foreground">This product was deleted.</p>
          <div className="mt-4 flex justify-end">
            <Link
              href="/finished-products"
              className="inline-flex h-8 items-center justify-center rounded-md border border-black bg-white px-3 text-sm font-medium text-black transition-colors hover:bg-muted"
            >
              Exit
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const aggregateStock =
    product.variants.length > 0
      ? product.variants.reduce((sum, v) => sum + v.quantityInStock, 0)
      : product.quantityInStock;

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          Edit Finished Product
        </h1>
        <p className="text-sm text-muted-foreground">
          Update finished product details.
        </p>
      </header>

      <EditFinishedProductForm
        id={product.id}
        initialName={product.name}
        unit={product.unit}
        quantityInStock={product.quantityInStock}
        aggregateStock={aggregateStock}
        initialVariants={variants}
      />
    </section>
  );
}

