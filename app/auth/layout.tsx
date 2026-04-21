export default function AuthFlowLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <h1 className="text-center text-2xl font-semibold tracking-tight">
          SME ERP
        </h1>
        {children}
      </div>
    </div>
  );
}
