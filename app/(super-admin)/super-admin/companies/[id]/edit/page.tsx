import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCompanyById, updateCompany } from "@/actions/super-admin";
import { DeleteCompanyDialog } from "@/components/super-admin/delete-company-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSession } from "@/lib/auth";

export default async function EditCompanyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  const { id } = await params;
  const company = await getCompanyById(id);
  if (!company) notFound();

  async function updateCompanyAction(formData: FormData) {
    "use server";

    const result = await updateCompany(id, {
      name: String(formData.get("name") ?? ""),
      industry: String(formData.get("industry") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
      isActive: String(formData.get("isActive") ?? "") === "on",
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    redirect("/super-admin/companies");
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Edit Company</h1>
        <p className="text-sm text-slate-600">
          Update company details and activation status.
        </p>
      </header>

      <form action={updateCompanyAction} className="space-y-6 rounded-md border bg-white p-5">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" defaultValue={company.name} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="industry">Industry</Label>
          <Input id="industry" name="industry" defaultValue={company.industry ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" name="phone" defaultValue={company.phone ?? ""} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="address">Address</Label>
          <Input id="address" name="address" defaultValue={company.address ?? ""} />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={company.isActive}
            className="size-4 rounded border-slate-300"
          />
          Active Company
        </label>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button asChild variant="outline">
            <Link href="/super-admin/companies">Cancel</Link>
          </Button>
          <Button type="submit">Save Changes</Button>
        </div>
      </form>

      <section className="mt-6 rounded-md border border-red-300 bg-red-50 p-5">
        <h2 className="text-base font-semibold text-red-700">Danger Zone</h2>
        <p className="mt-1 text-sm text-red-700">
          Permanently delete this company and all associated data. This action cannot
          be undone.
        </p>
        <div className="mt-4">
          <DeleteCompanyDialog companyId={company.id} companyName={company.name} />
        </div>
      </section>
    </section>
  );
}
