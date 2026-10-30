import { NextResponse } from "next/server";

import { filtrarMaterias, listarMaterias } from "@/lib/supabase/materias";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const consulta = new URL(request.url).searchParams.get("q") ?? "";
  const { materias, error } = await listarMaterias();

  if (error) {
    // Un fallo de Supabase no se cachea: la CDN no debe repetirlo durante
    // minutos después de que el servicio se recupere.
    return NextResponse.json(
      { ok: false, codigo: "interno", mensaje: error },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  // Una respuesta vacía casi siempre es una tabla sin datos: no se cachea para
  // que la CDN no la sirva después de corregirlo.
  const cache =
    materias.length > 0
      ? "public, s-maxage=300, stale-while-revalidate=600"
      : "no-store";

  return NextResponse.json(
    { ok: true, materias: filtrarMaterias(materias, consulta) },
    { headers: { "Cache-Control": cache } },
  );
}
