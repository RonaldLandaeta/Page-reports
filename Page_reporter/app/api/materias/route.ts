import { NextResponse } from "next/server";

import { filtrarMaterias, listarMaterias } from "@/lib/supabase/materias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const consulta = new URL(request.url).searchParams.get("q") ?? "";
  const materias = await listarMaterias();

  return NextResponse.json(
    { ok: true, materias: filtrarMaterias(materias, consulta) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
