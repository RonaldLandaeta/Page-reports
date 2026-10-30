import { NextResponse } from "next/server";

import { cerrarSesionAdmin } from "@/lib/admin/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await cerrarSesionAdmin();
  return NextResponse.json({ ok: true });
}
