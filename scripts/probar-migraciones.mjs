/**
 * Prueba las migraciones contra un Postgres real (PGlite, WASM).
 *
 * Uso: npm run db:test
 *
 * Cubre cuatro escenarios:
 *   1. Base nueva con supabase/setup.sql (y setup.sql dos veces seguidas).
 *   2. Base vieja (0001–0005) con datos → 0006 + 0007.
 *   3. Base vieja con datos → setup.sql completo.
 *   4. Permisos/políticas creados a mano → 0009 los cierra.
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
  afirmar(/^TK-\d{7}$/.test(alta.rows[0].ticket), "ticket por defecto TK-XXXXXXX (7 dígitos)");

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

  // 0008: alta atómica con reglas de negocio.
  const rpc = (ci, materia, tipo, detalle = "") =>
    db.query(
      `select public.crear_reporte(
         $1, 'Persona Prueba', 'persona@universidad.edu.ve', '02002',
         $2, 'Materia de prueba', $3::public.tipo_error_reporte,
         $4, 'Motivo suficientemente largo'
       ) as r`,
      [ci, materia, tipo, detalle],
    );

  const creado = await rpc("87654321", "FING-02002", "cruce-horario");
  afirmar(creado.rows[0].r.ok === true, "crear_reporte inserta el reporte");

  const duplicado = await rpc("87654321", "FING-02002", "cruce-horario");
  afirmar(
    duplicado.rows[0].r.codigo === "duplicado",
    "crear_reporte detecta el duplicado de 24 h",
  );
  afirmar(
    /^TK-\d{7}$/.test(creado.rows[0].r.reporte.ticket),
    "crear_reporte genera tickets de 7 dígitos",
  );

  // La cédula no prueba identidad: otro correo no recibe el ticket ajeno.
  const duplicadoAjeno = await db.query(
    `select public.crear_reporte(
       '87654321', 'Otra Persona', 'otra@universidad.edu.ve', '02002',
       'FING-02002', 'Materia de prueba', 'cruce-horario',
       '', 'Motivo suficientemente largo'
     ) as r`,
  );
  afirmar(
    duplicadoAjeno.rows[0].r.codigo === "duplicado" &&
      duplicadoAjeno.rows[0].r.ticket === undefined,
    "el ticket duplicado no se filtra a otro correo",
  );

  // Un correo institucional solo puede quedar vinculado a una cédula.
  const correoDeOtraCedula = await db.query(
    `select public.crear_reporte(
       '12345678', 'Ana Prueba', 'persona@universidad.edu.ve', '02003',
       'FING-02003', 'Otra materia', 'cruce-horario',
       '', 'Motivo suficientemente largo'
     ) as r`,
  );
  afirmar(
    correoDeOtraCedula.rows[0].r.codigo === "validacion",
    "un correo no puede usar una segunda cédula",
  );

  const intentoCedula = await db.query(`
    insert into public.consulta_intentos (ip_hash, ci)
    values ('hash-prueba', '12345678')
    returning ci
  `);
  afirmar(
    intentoCedula.rows[0].ci === "12345678",
    "consulta_intentos guarda la cédula para el límite por cédula",
  );

  const otroSinDetalle = await rpc("87654321", "FING-02003", "otro", "   ");
  afirmar(
    otroSinDetalle.rows[0].r.codigo === "validacion",
    "crear_reporte exige detalle para «otro»",
  );

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

  const autor = await db.query(
    `select public.cambiar_estado_lote($1::uuid[], 'resuelto'::public.estado_reporte, 'Listo', 'admin@ucab.edu.ve') as n`,
    [idsLote],
  );
  afirmar(autor.rows[0].n === 2, "el lote vuelve a cambiar el estado");
  const eventoAutor = await db.query(
    `select admin_email, nota from public.reporte_eventos
     where reporte_id = $1 order by id desc limit 1`,
    [idsLote[0]],
  );
  afirmar(
    eventoAutor.rows[0].admin_email === "admin@ucab.edu.ve" &&
      eventoAutor.rows[0].nota === "Listo",
    "el historial guarda quién hizo el cambio (admin_email)",
  );

  await db.exec(`
    insert into auth.users (id) values
      ('00000000-0000-0000-0000-0000000000a1'),
      ('00000000-0000-0000-0000-0000000000a2');
    insert into public.administradores (user_id, rol) values
      ('00000000-0000-0000-0000-0000000000a1', 'super'),
      ('00000000-0000-0000-0000-0000000000a2', 'admin');
  `);

  const intentar = async (sql) => {
    try {
      await db.exec(sql);
      return false;
    } catch {
      return true;
    }
  };

  afirmar(
    await intentar(`update public.administradores set rol = 'jefe'`),
    "rol inválido rechazado por el CHECK",
  );
  afirmar(
    await intentar(`delete from public.administradores where user_id = '00000000-0000-0000-0000-0000000000a1'`),
    "no se puede borrar al último super",
  );
  afirmar(
    await intentar(`update public.administradores set rol = 'admin' where user_id = '00000000-0000-0000-0000-0000000000a1'`),
    "no se puede degradar al último super",
  );

  await db.exec(`update public.administradores set rol = 'super' where user_id = '00000000-0000-0000-0000-0000000000a2'`);
  afirmar(
    !(await intentar(`update public.administradores set rol = 'admin' where user_id = '00000000-0000-0000-0000-0000000000a1'`)),
    "con dos super sí se puede degradar a uno",
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

  await db.exec(await migracion("0010_ticket_consultas.sql"));
  afirmar(true, "0010 es idempotente al ejecutarse dos veces");

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

  await db.exec(`
    insert into auth.users (id) values
      ('00000000-0000-0000-0000-0000000000b1'),
      ('00000000-0000-0000-0000-0000000000b2');
    insert into public.administradores (user_id, creado_en) values
      ('00000000-0000-0000-0000-0000000000b2', now()),
      ('00000000-0000-0000-0000-0000000000b1', now() - interval '2 days');
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


  const roles = await db.query(
    `select user_id, rol from public.administradores order by user_id`,
  );
  afirmar(
    roles.rows[0].rol === "super" && roles.rows[1].rol === "admin",
    "el administrador más antiguo pasa a ser super",
  );

  await db.exec(await migracion("0007_esquema_consistente.sql"));
  afirmar(true, "0007 es idempotente al ejecutarse dos veces");

  const rolesDespues = await db.query(
    `select count(*)::int as n from public.administradores where rol = 'super'`,
  );
  afirmar(rolesDespues.rows[0].n === 1, "repetir 0007 no crea más super");

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

// ── Escenario 4: políticas manuales y permisos abiertos → 0009 los cierra ──
{
  console.log("\n[4] políticas manuales y permisos abiertos → 0009");
  const db = new PGlite();
  await prepararRoles(db);

  await aplicar(db, [
    "0001_init.sql",
    "0002_auditoria.sql",
    "0003_admin.sql",
    "0004_permisos.sql",
    "0005_catalogo_local.sql",
    "0006_malla_local.sql",
    "0007_esquema_consistente.sql",
    "0008_crear_reporte_atomico.sql",
    "0010_ticket_consultas.sql",
  ]);

  // Reproduce lo que había en el proyecto real: permisos por defecto de
  // Supabase para anon/authenticated + políticas añadidas desde el panel.
  await db.exec(`
    grant select, insert on public.reportes to anon, authenticated;
    grant select on public.administradores to authenticated;
    create policy "Permitir lectura de reportes" on public.reportes
      for select to public using (true);
    create policy "Permitir inserción pública de reportes" on public.reportes
      for insert to public with check (true);
    create policy "Permitir lectura de administradores"
      on public.administradores for select to authenticated using (true);
  `);

  const privilegio = async (rol, tabla, tipo) =>
    (await db.query(
      `select has_table_privilege($1, $2, $3) as v`,
      [rol, `public.${tabla}`, tipo],
    )).rows[0].v;

  afirmar(
    await privilegio("anon", "reportes", "select"),
    "(deriva reproducida) anon podía leer reportes",
  );

  // Alta con la función atómica: el ticket solo vuelve al mismo correo.
  const alta = (correo) =>
    db.query(
      `select public.crear_reporte(
         '12345678', 'Ana Prueba', $1, '1', 'FING-02002', 'Álgebra',
         'cruce-horario', '', 'Motivo suficientemente largo'
       ) as r`,
      [correo],
    );

  const primero = (await alta("ana@universidad.edu.ve")).rows[0].r;
  afirmar(
    primero.ok === true && /^TK-\d{7}$/.test(primero.reporte.ticket),
    "crear_reporte crea el reporte con ticket de 7 dígitos",
  );

  const propio = (await alta("ana@universidad.edu.ve")).rows[0].r;
  afirmar(
    propio.codigo === "duplicado" &&
      propio.ticket === primero.reporte.ticket,
    "el mismo correo recibe su ticket duplicado",
  );

  const ajeno = (await alta("otra@universidad.edu.ve")).rows[0].r;
  afirmar(
    ajeno.codigo === "duplicado" && ajeno.ticket === undefined,
    "otro correo NO recibe el ticket ajeno",
  );

  await db.exec(await migracion("0009_cerrar_acceso_publico.sql"));
  await db.exec(await migracion("0009_cerrar_acceso_publico.sql"));
  afirmar(true, "0009 es idempotente");

  const politicas = await db.query(
    `select count(*)::int as n from pg_policies where schemaname = 'public'`,
  );
  afirmar(politicas.rows[0].n === 0, "no queda ninguna política en public");

  for (const rol of ["anon", "authenticated"]) {
    for (const tabla of [
      "reportes",
      "reporte_eventos",
      "administradores",
      "codigos_verificacion",
      "admin_intentos",
      "consulta_intentos",
    ]) {
      for (const tipo of ["select", "insert", "update", "delete"]) {
        if (await privilegio(rol, tabla, tipo)) {
          throw new Error(`FALLO: ${rol} aún tiene ${tipo} en ${tabla}`);
        }
      }
    }
  }
  afirmar(true, "anon y authenticated no tienen ningún permiso sobre las tablas");

  afirmar(
    (await privilegio("service_role", "reportes", "select")) &&
      (await privilegio("service_role", "reportes", "insert")),
    "service_role conserva sus permisos",
  );

  const ejecutar = async (rol, firma) =>
    (await db.query(
      `select has_function_privilege($1, $2, 'execute') as v`,
      [rol, firma],
    )).rows[0].v;
  const firmaAlta =
    "public.crear_reporte(text,text,text,text,text,text,public.tipo_error_reporte,text,text)";
  afirmar(
    !(await ejecutar("anon", firmaAlta)) &&
      !(await ejecutar("authenticated", firmaAlta)),
    "anon/authenticated no pueden ejecutar crear_reporte",
  );
  afirmar(
    await ejecutar("service_role", firmaAlta),
    "service_role sí puede ejecutar crear_reporte",
  );

  // Una tabla nueva ya no hereda permisos para anon.
  await db.exec(`create table public.prueba_futura (id int)`);
  afirmar(
    !(await privilegio("anon", "prueba_futura", "select")),
    "las tablas nuevas nacen cerradas para anon",
  );

  await db.close();
}

console.log(`\nTodo OK (${comprobaciones} comprobaciones)`);
