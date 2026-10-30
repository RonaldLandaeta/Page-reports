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
 */
export async function listarMaterias(): Promise<Materia[]> {
  try {
    const { data, error } = await obtenerSupabaseAdmin()
      .from("materias")
      .select("nrc, nombre, docente, horario, aula")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (error) {
      console.error("[materias] No se pudo leer el catálogo de Supabase.", error);
      return [];
    }

    return (data ?? []).map((fila) => mapearMateria(fila as FilaMateria));
  } catch (err) {
    console.error("[materias] Error al inicializar cliente Supabase.", err);
    return [];
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