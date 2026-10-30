import { NextResponse } from "next/server";

import { cerrarSesionAdmin } from "@/lib/admin/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  cerrarSesionAdmin(response);
  return response;
}
