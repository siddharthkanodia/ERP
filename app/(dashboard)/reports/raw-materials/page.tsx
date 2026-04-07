import { getAllRawMaterials } from "@/actions/raw-materials";

import { RawMaterialReportClient } from "@/components/reports/RawMaterialReportClient";

export default async function RawMaterialInventoryReportPage() {
  const materials = await getAllRawMaterials();
  const defaultMaterialId = materials[0]?.id ?? "";

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">
          Raw Material Inventory Report
        </h1>
        <p className="text-sm text-muted-foreground">
          Day-by-day breakdown for opening, received, issued, and closing balances.
        </p>
      </header>

      <RawMaterialReportClient
        materials={materials.map((m) => ({ id: m.id, name: m.name }))}
        defaultMaterialId={defaultMaterialId}
      />
    </section>
  );
}
