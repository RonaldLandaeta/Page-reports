import { NextResponse } from "next/server";

import { COOKIE_ADMIN } from "@/lib/admin/sesion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const respuesta = NextResponse.json({ ok: true });
  respuesta.cookies.set(COOKIE_ADMIN, "", { path: "/", maxAge: 0 });
  return respuesta;
}
