import { DispatchForm } from "@/components/finished-goods/DispatchForm";

export default function DispatchFinishedProductPage() {
  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Dispatch Stock</h1>
        <p className="text-sm text-muted-foreground">
          Reduce inventory by dispatching one or more finished products in a single batch.
        </p>
      </header>

      <DispatchForm />
    </section>
  );
}
