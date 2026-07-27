import { StaticAdminGate } from "@/components/auth/static-app-gate";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaticAdminGate>{children}</StaticAdminGate>;
}
