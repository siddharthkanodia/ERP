import Link from "next/link";
import { redirect } from "next/navigation";

import { createCompany } from "@/actions/super-admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAuthSession } from "@/lib/auth";

export default async function NewCompanyPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (session.role !== "SUPER_ADMIN") redirect("/dashboard");

  async function createCompanyAction(formData: FormData) {
    "use server";

    const result = await createCompany({
      name: String(formData.get("name") ?? ""),
      industry: String(formData.get("industry") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
      adminName: String(formData.get("adminName") ?? ""),
      adminEmail: String(formData.get("adminEmail") ?? ""),
      adminPassword: String(formData.get("adminPassword") ?? ""),
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    redirect("/super-admin/companies");
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Create Company</h1>
        <p className="text-sm text-slate-600">
          The user created here will automatically be assigned the ADMIN role.
        </p>
      </header>

      <form action={createCompanyAction} className="space-y-6 rounded-md border bg-white p-5">
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Company Info</h2>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" placeholder="e.g. Acme Manufacturing" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="industry">Industry</Label>
            <Input id="industry" name="industry" placeholder="e.g. Plastics" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" placeholder="e.g. +91 99999 99999" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input id="address" name="address" placeholder="e.g. Industrial Area, Pune" />
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <h2 className="text-sm font-semibold text-slate-900">Initial Admin Account</h2>
          <div className="space-y-1.5">
            <Label htmlFor="adminName">Admin Name</Label>
            <Input id="adminName" name="adminName" placeholder="e.g. Jane Smith" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adminEmail">Admin Email</Label>
            <Input
              id="adminEmail"
              name="adminEmail"
              type="email"
              placeholder="admin@company.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adminPassword">Admin Password</Label>
            <Input
              id="adminPassword"
              name="adminPassword"
              type="password"
              placeholder="Minimum 8 characters"
              minLength={8}
              required
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button asChild variant="outline">
            <Link href="/super-admin/companies">Cancel</Link>
          </Button>
          <Button type="submit">Create Company</Button>
        </div>
      </form>
    </section>
  );
}
