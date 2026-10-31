/**
 * Prueba las migraciones contra un Postgres real (PGlite, WASM).
 *
 * Uso: npm run db:test
 *
 * Cubre tres escenarios:
 *   1. Base nueva con supabase/setup.sql (y setup.sql dos veces seguidas).
 *   2. Base vieja (0001–0005) con datos → 0006 + 0007.
 *   3. Base vieja con datos → setup.sql completo.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const carpetaMigraciones = path.join(raiz, "supabase", "migrations");

const leer = (archivo) => readFile(archivo, "utf8");
const migracion = (nombre) => leer(path.join(carpetaMigraciones, nombre));

async function prepararRoles(db) {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
  `);
}

let comprobaciones = 0;

function afirmar(condicion, mensaje) {
  comprobaciones += 1;
  if (!condicion) throw new Error(`FALLO: ${mensaje}`);
  console.log(`  ok · ${mensaje}`);
}

async function aplicar(db, archivos) {
  for (const archivo of archivos) await db.exec(await migracion(archivo));
}

// ── Escenario 1: base nueva con setup.sql completo ──────────────────────────
{
  console.log("\n[1] setup.sql completo en base nueva");
  const db = new PGlite();
  await prepararRoles(db);

  const setup = await leer(path.join(raiz, "supabase", "setup.sql"));
  await db.exec(setup);

  const tablas = await db.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `);
  const nombres = tablas.rows.map((fila) => fila.table_name);
  afirmar(!nombres.includes("materias"), "la tabla materias ya no existe");
  afirmar(nombres.includes("reportes"), "la tabla reportes existe");

  const columnas = await db.query(`
    select column_name, udt_name from information_schema.columns
    where table_schema = 'public' and table_name = 'reportes'
    order by ordinal_position
  `);
  const porNombre = Object.fromEntries(
    columnas.rows.map((fila) => [fila.column_name, fila.udt_name]),
  );
  afirmar(porNombre.materia_codigo === "text", "reportes.materia_codigo existe");
  afirmar(
    porNombre.tipo_error_detalle === "text",
    "reportes.tipo_error_detalle existe",
  );
  afirmar(!("materia_aula" in porNombre), "reportes.materia_aula fue eliminada");
  afirmar(porNombre.estado === "estado_reporte", "estado usa el enum");
  afirmar(
    porNombre.tipo_error === "tipo_error_reporte",
    "tipo_error usa el enum",
  );

  const enums = await db.query(`
    select t.typname, e.enumlabel
    from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typnamespace = 'public'::regnamespace
    order by t.typname, e.enumsortorder
  `);
  const valores = enums.rows.map((fila) => `${fila.typname}:${fila.enumlabel}`);
  afirmar(valores.includes("estado_reporte:en-revision"), "enum de estados");
  afirmar(
    valores.includes("tipo_error_reporte:error-prerrequisito"),
    "enum de tipos de error",
  );

  const alta = await db.query(`
    insert into public.reportes (
      ci, nombre, correo, nrc, materia_codigo, materia_nombre,
      tipo_error, motivo
    ) values (
      '12345678', 'Ana Martínez', 'ana@universidad.edu.ve', '02002',
      'FING-02002', 'Álgebra y Trigonometría',
      'cambio-horario', 'La sección no aparece en mi reserva'
    )
    returning id, ticket, estado
  `);
  afirmar(/^TK-\d{6}$/.test(alta.rows[0].ticket), "ticket por defecto TK-XXXXXX");

  const evento = await db.query(
    `select estado_nuevo from public.reporte_eventos where reporte_id = $1`,
    [alta.rows[0].id],
  );
  afirmar(evento.rows.length === 1, "se creó el evento inicial");
  afirmar(evento.rows[0].estado_nuevo === "pendiente", "evento inicial pendiente");

  const cambio = await db.query(
    `select public.cambiar_estado_reporte($1::uuid, $2::public.estado_reporte, $3) as r`,
    [alta.rows[0].id, "resuelto", "Corregido"],
  );
  afirmar(cambio.rows[0].r.ok === true, "cambiar_estado_reporte funciona");

  const historial = await db.query(
    `select estado_nuevo, nota from public.reporte_eventos
     where reporte_id = $1 order by id`,
    [alta.rows[0].id],
  );
  afirmar(historial.rows.length === 2, "el cambio generó un segundo evento");
  afirmar(
    historial.rows[1].nota === "Corregido",
    "la nota se guardó en el evento del cambio",
  );

  let rechazado = false;
  try {
    await db.query(`
      insert into public.reportes (
        ci, nombre, correo, nrc, materia_codigo, materia_nombre,
        tipo_error, tipo_error_detalle, motivo
      ) values (
        '12345678', 'Ana Martínez', 'ana@universidad.edu.ve', '02002',
        'FING-02002', 'Álgebra y Trigonometría',
        'otro', '', 'Motivo suficientemente largo'
      )
    `);
  } catch {
    rechazado = true;
  }
  afirmar(rechazado, "«otro» sin detalle es rechazado por el CHECK");

  // Auditoría de login y cambio de estado por lotes (0007, secciones 10 y 11).
  const aud = await db.query(`
    insert into public.admin_intentos (correo, ip_hash, exito, motivo)
    values ('admin@ucab.edu.ve', 'hash', false, 'credenciales')
    returning id
  `);
  afirmar(aud.rows.length === 1, "admin_intentos acepta un intento fallido");

  const lote = await db.query(`
    insert into public.reportes (
      ci, nombre, correo, nrc, materia_codigo, materia_nombre,
      tipo_error, motivo
    ) values
    ('11111111', 'Ana Prueba', 'a@universidad.edu.ve', '1', 'M-1', 'Materia 1', 'cruce-horario', 'Motivo suficientemente largo'),
    ('22222222', 'Beto Prueba', 'b@universidad.edu.ve', '2', 'M-2', 'Materia 2', 'cruce-horario', 'Motivo suficientemente largo')
    returning id
  `);
  const idsLote = lote.rows.map((fila) => fila.id);

  const primero = await db.query(
    `select public.cambiar_estado_lote($1::uuid[], 'en-revision'::public.estado_reporte, $2) as n`,
    [idsLote, "Descargado por admin"],
  );
  afirmar(primero.rows[0].n === 2, "cambiar_estado_lote cambia los 2 reportes");

  const segundo = await db.query(
    `select public.cambiar_estado_lote($1::uuid[], 'en-revision'::public.estado_reporte, null) as n`,
    [idsLote],
  );
  afirmar(segundo.rows[0].n === 0, "repetir el lote no cambia nada");

  const notaLote = await db.query(
    `select nota from public.reporte_eventos
     where reporte_id = $1 order by id desc limit 1`,
    [idsLote[0]],
  );
  afirmar(
    notaLote.rows[0].nota === "Descargado por admin",
    "la nota del lote queda en el historial",
  );

  await db.exec(setup);
  const eventos = await db.query(
    `select count(*)::int as total from public.reporte_eventos where reporte_id = $1`,
    [alta.rows[0].id],
  );
  afirmar(
    eventos.rows[0].total === 2,
    "setup.sql es idempotente al ejecutarse dos veces",
  );

  await db.close();
}

// ── Escenario 2: base vieja (0001–0005) con datos → 0006 + 0007 ─────────────
{
  console.log("\n[2] base vieja (0001–0005) → 0006 + 0007");
  const db = new PGlite();
  await prepararRoles(db);

  await aplicar(db, [
    "0001_init.sql",
    "0002_auditoria.sql",
    "0003_admin.sql",
    "0004_permisos.sql",
    "0005_catalogo_local.sql",
  ]);

  await db.query(`
    insert into public.reportes (
      ticket, ci, nombre, correo, nrc, tipo_error, motivo,
      materia_nombre, materia_aula, estado
    ) values
    (
      'TK-123456', '12345678', 'Luis Pérez', 'luis@universidad.edu.ve',
      '12345', 'horario-incorrecto', 'El horario no coincide con la reserva',
      'Cálculo I', 'Aula 3', 'pendiente'
    ),
    (
      'TK-123457', '12345678', 'Luis Pérez', 'luis@universidad.edu.ve',
      '02002', 'otro', 'La sección no aparece en mi reserva',
      'Álgebra y Trigonometría', 'FING-02002', 'pendiente'
    )
  `);

  await aplicar(db, ["0006_malla_local.sql", "0007_esquema_consistente.sql"]);

  const fila = await db.query(`
    select materia_codigo, tipo_error, estado,
           (select count(*) from information_schema.columns
             where table_schema = 'public' and table_name = 'reportes'
               and column_name = 'materia_aula') as aula
    from public.reportes where ticket = 'TK-123456'
  `);

  afirmar(fila.rows[0].materia_codigo === "12345", "materia_codigo se rellenó");
  afirmar(fila.rows[0].tipo_error === "cambio-horario", "tipo antiguo convertido");
  afirmar(Number(fila.rows[0].aula) === 0, "materia_aula eliminada");
  afirmar(fila.rows[0].estado === "pendiente", "estado conservado");

  const filaCodigo = await db.query(`
    select materia_codigo, tipo_error, tipo_error_detalle
    from public.reportes where ticket = 'TK-123457'
  `);
  afirmar(
    filaCodigo.rows[0].materia_codigo === "FING-02002",
    "se recupera el código de malla guardado en materia_aula",
  );
  afirmar(
    filaCodigo.rows[0].tipo_error_detalle === "Otro problema",
    "«otro» sin detalle recibe un detalle de respaldo",
  );

  const historial = await db.query(`
    select nota from public.reporte_eventos
    where reporte_id = (select id from public.reportes where ticket = 'TK-123456')
  `);
  afirmar(historial.rows.length >= 1, "historial reconstruido para el reporte viejo");

  await db.exec(await migracion("0007_esquema_consistente.sql"));
  afirmar(true, "0007 es idempotente al ejecutarse dos veces");

  await db.close();
}

// ── Escenario 3: base vieja con datos + setup.sql completo ─────────────────
{
  console.log("\n[3] base vieja con datos + setup.sql completo");
  const db = new PGlite();
  await prepararRoles(db);

  await aplicar(db, [
    "0001_init.sql",
    "0002_auditoria.sql",
    "0003_admin.sql",
    "0004_permisos.sql",
    "0005_catalogo_local.sql",
  ]);

  await db.query(`
    insert into public.reportes (
      ticket, ci, nombre, correo, nrc, tipo_error, motivo,
      materia_nombre, materia_aula, estado
    ) values (
      'TK-654321', '87654321', 'María Gómez', 'maria@universidad.edu.ve',
      '54321', 'cruce-materias', 'Dos materias a la misma hora el martes',
      'Física I', 'Aula 7', 'en-revision'
    )
  `);

  const setup = await leer(path.join(raiz, "supabase", "setup.sql"));
  await db.exec(setup);

  const fila = await db.query(`
    select materia_codigo, tipo_error, estado
    from public.reportes where ticket = 'TK-654321'
  `);
  afirmar(fila.rows[0].materia_codigo === "54321", "datos viejos conservados");
  afirmar(fila.rows[0].tipo_error === "cruce-horario", "tipo convertido");
  afirmar(fila.rows[0].estado === "en-revision", "estado conservado");

  await db.close();
}

console.log(`\nTodo OK (${comprobaciones} comprobaciones)`);
