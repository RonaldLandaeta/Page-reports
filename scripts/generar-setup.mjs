/**
 * Genera supabase/setup.sql concatenando las migraciones en orden.
 *
 * Uso: npm run db:setup
 *
 * Así el archivo que se pega en el SQL Editor nunca se queda atrás cuando se
 * agrega o corrige una migración.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const raiz = process.cwd();
const carpetaMigraciones = path.join(raiz, "supabase", "migrations");
const destino = path.join(raiz, "supabase", "setup.sql");

const archivos = (await readdir(carpetaMigraciones))
  .filter((archivo) => archivo.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b, "en"));

if (archivos.length === 0) {
  throw new Error("No hay migraciones en supabase/migrations.");
}

const secciones = [];

for (const archivo of archivos) {
  const sql = await readFile(path.join(carpetaMigraciones, archivo), "utf8");

  secciones.push(
    [
      "-- ============================================================================",
      `-- supabase/migrations/${archivo}`,
      "-- ============================================================================",
      "",
      sql.trim(),
      "",
    ].join("\n"),
  );
}

const cabecera = [
  "-- ============================================================================",
  "-- Reporte de Horarios · setup completo",
  "-- ----------------------------------------------------------------------------",
  "-- GENERADO AUTOMÁTICAMENTE por scripts/generar-setup.mjs.",
  "-- No edites este archivo a mano: modifica supabase/migrations y ejecuta",
  "--   npm run db:setup",
  "--",
  "-- Supabase → SQL Editor → pega TODO el contenido y pulsa Run.",
  "-- Es idempotente: puede ejecutarse sobre una base nueva o ya existente.",
  "-- Se ejecuta dentro de una transacción: si algo falla, no deja la base a medias.",
  "-- ============================================================================",
  "",
  "begin;",
  "",
  "",
].join("\n");

await writeFile(destino, cabecera + secciones.join("\n") + "\ncommit;\n", "utf8");

console.log(
  `supabase/setup.sql generado con ${archivos.length} migraciones: ${archivos.join(", ")}`,
);
