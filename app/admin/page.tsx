import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { COOKIE_ADMIN, obtenerAdminPorToken } from "@/lib/admin/sesion";
import { AdminView } from "./AdminView";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const token = (await cookies()).get(COOKIE_ADMIN)?.value;
  const admin = token ? await obtenerAdminPorToken(token) : null;

  if (!admin) redirect("/admin/login");

  return <AdminView miUserId={admin.userId} />;
}
