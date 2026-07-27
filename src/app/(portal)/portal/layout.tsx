import { StaticMemberGate } from "@/components/auth/static-app-gate";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <StaticMemberGate>{children}</StaticMemberGate>;
}
