import { AdminShell } from "@/components/layout/AdminShell";

export default function CustomersLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
