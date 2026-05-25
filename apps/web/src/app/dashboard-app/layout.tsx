import { DashboardContextProvider } from "@/lib/chatwoot/dashboard-context";

export default function DashboardAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardContextProvider>
      <div className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    </DashboardContextProvider>
  );
}
