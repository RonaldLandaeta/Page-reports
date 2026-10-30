import { readFile } from "node:fs/promises";
import path from "node:path";

import type { Materia } from "./types";

/**
 * Parser CSV mínimo con soporte para campos entre comillas y comillas escapadas.
 * Evita agregar una dependencia solo para leer el catálogo del prototipo.
 */
function parsearLinea(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let entreComillas = false;

  for (let indice = 0; indice < linea.length; indice += 1) {
    const caracter = linea[indice];

    if (caracter === '"') {
      if (entreComillas && linea[indice + 1] === '"') {
        actual += '"';
        indice += 1;
      } else {
        entreComillas = !entreComillas;
      }
      continue;
    }

    if (caracter === "," && !entreComillas) {
      campos.push(actual.trim());
      actual = "";
      continue;
    }

    actual += caracter;
  }

  campos.push(actual.trim());
  return campos;
}

function parsearMaterias(contenido: string): Materia[] {
  const lineas = contenido
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((linea) => linea.trim().length > 0 && !linea.startsWith("#"));

  if (lineas.length < 2) return [];

  const encabezados = parsearLinea(lineas[0]).map((valor) =>
    valor.toLowerCase().trim(),
  );

  const indice = (nombres: string[]): number =>
    encabezados.findIndex((encabezado) => nombres.includes(encabezado));

  const iNrc = indice(["nrc"]);
  const iNombre = indice(["materia", "nombre"]);
  const iDocente = indice(["docente"]);
  const iHorario = indice(["horario"]);
  const iAula = indice(["aula"]);

  if (iNrc === -1 || iNombre === -1) return [];

  const materias = new Map<string, Materia>();

  for (const linea of lineas.slice(1)) {
    const campos = parsearLinea(linea);
    const nrc = campos[iNrc]?.trim() ?? "";
    const nombre = campos[iNombre]?.trim() ?? "";

    if (!nrc || !nombre) continue;

    materias.set(nrc, {
      nrc,
      nombre,
      docente: iDocente >= 0 ? (campos[iDocente] ?? "").trim() : "",
      horario: iHorario >= 0 ? (campos[iHorario] ?? "").trim() : "",
      aula: iAula >= 0 ? (campos[iAula] ?? "").trim() : "",
    });
  }

  return [...materias.values()];
}

/**
 * Lee el catálogo editable desde data/materias.csv.
 * Al cambiar a una API académica, esta función se reemplaza por un fetch.
 */
export async function obtenerMaterias(): Promise<Materia[]> {
  const ruta = path.join(process.cwd(), "data", "materias.csv");

  try {
    const contenido = await readFile(ruta, "utf8");
    return parsearMaterias(contenido);
  } catch (error) {
    console.error("No se pudo leer data/materias.csv.", error);
    return [];
  }
}
