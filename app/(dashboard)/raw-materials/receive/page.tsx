import { ReceiveStockForm } from "@/components/raw-materials/ReceiveStockForm";

export default function ReceiveRawMaterialPage() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Receive Stock</h1>
        <p className="text-sm text-muted-foreground">
          Add newly received quantity to one or more raw materials in a single batch.
        </p>
      </header>

      <ReceiveStockForm />
    </section>
  );
}
