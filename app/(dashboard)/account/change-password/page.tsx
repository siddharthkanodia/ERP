import { ChangePasswordForm } from "./change-password-form";

export default function ChangePasswordPage() {
  return (
    <section className="mx-auto w-full max-w-lg px-4 py-6 sm:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">Change Password</h1>
        <p className="text-sm text-muted-foreground">
          Update your login password.
        </p>
      </header>

      <ChangePasswordForm />
    </section>
  );
}
