import "server-only";

import type { Materia } from "@/lib/types";
import { obtenerSupabaseAdmin } from "./admin";

interface FilaMateria {
  nrc: string;
  nombre: string;
  docente: string | null;
  horario: string | null;
  aula: string | null;
}

export interface ResultadoMaterias {
  materias: Materia[];
  /** `null` si la consulta fue correcta; un mensaje si Supabase falló. */
  error: string | null;
}

const MENSAJE_ERROR =
  "No se pudo cargar el catálogo de materias. Intenta de nuevo en unos minutos.";

function mapearMateria(fila: FilaMateria): Materia {
  return {
    nrc: fila.nrc,
    nombre: fila.nombre,
    docente: fila.docente ?? "",
    horario: fila.horario ?? "",
    aula: fila.aula ?? "",
  };
}

/**
 * Catálogo activo desde la tabla public.materias en Supabase.
 *
 * Devuelve `error` cuando la consulta falla para que la interfaz no confunda
 * "Supabase no responde" con "el catálogo está vacío".
 */
export async function listarMaterias(): Promise<ResultadoMaterias> {
  try {
    const { data, error } = await obtenerSupabaseAdmin()
      .from("materias")
      .select("nrc, nombre, docente, horario, aula")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("[materias] No se pudo leer el catálogo de Supabase.", error);
      return { materias: [], error: MENSAJE_ERROR };
    }

    if (!data || data.length === 0) {
      console.warn(
        "[materias] La tabla public.materias no devolvió filas activas. ¿Se ejecutó supabase/seed.sql en este proyecto de Supabase?",
      );
    }

    return {
      materias: (data ?? []).map((fila) => mapearMateria(fila as FilaMateria)),
      error: null,
    };
  } catch (err) {
    console.error("[materias] Error al inicializar cliente Supabase.", err);
    return { materias: [], error: MENSAJE_ERROR };
  }
}

/** Búsqueda simple por NRC o nombre, usada por /api/materias. */
export function filtrarMaterias(materias: Materia[], consulta: string): Materia[] {
  const q = consulta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  if (!q) return materias;

  return materias.filter((materia) => {
    const texto = `${materia.nrc} ${materia.nombre}`
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return texto.includes(q);
  });
}
