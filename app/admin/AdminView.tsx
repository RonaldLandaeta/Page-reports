"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import {
  ESTADOS_REPORTE,
  getEstadoReporteLabel,
  getTipoErrorLabel,
} from "@/lib/catalogos";
import { postJson } from "@/lib/api-cliente";
import type { EstadoReporte, Reporte } from "@/lib/types";

import { ChevronDownIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/ThemeToggle";

const formatoFecha = new Intl.DateTimeFormat("es-VE", {
  dateStyle: "medium",
  timeStyle: "short",
});

const JSON_HEADERS = { "Content-Type": "application/json" };

const boton =
  "rounded-xl px-3.5 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";
const botonPrimario = `${boton} bg-indigo-600 text-white hover:bg-indigo-700`;
const botonSecundario = `${boton} border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800`;
const campo =
  "rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10";

interface RespuestaApi {
  ok: boolean;
  mensaje?: string;
  [clave: string]: unknown;
}

/** Lee `{ ok, mensaje }` sin romperse si la respuesta no es JSON. */
async function leerRespuesta(respuesta: Response): Promise<RespuestaApi> {
  try {
    return (await respuesta.json()) as RespuestaApi;
  } catch {
    return { ok: false, mensaje: "Respuesta inesperada del servidor." };
  }
}

/** Checkbox de grupo con estado intermedio cuando hay tickets sueltos marcados. */
function CheckboxGrupo({
  marcado,
  parcial,
  etiqueta,
  onChange,
}: {
  marcado: boolean;
  parcial: boolean;
  etiqueta: string;
  onChange: () => void;
}) {
  return (
    <input
      type="checkbox"
      checked={marcado}
      aria-label={etiqueta}
      onChange={onChange}
      ref={(elemento) => {
        if (elemento) elemento.indeterminate = parcial;
      }}
      className="mt-1 h-4 w-4 shrink-0"
    />
  );
}

export function AdminView({ miUserId }: { miUserId: string }) {
  const router = useRouter();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [total, setTotal] = useState(0);
  const [estado, setEstado] = useState<"" | EstadoReporte>("");
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});

  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());
  const [contraidos, setContraidos] = useState<ReadonlySet<string>>(new Set());
  const [formato, setFormato] = useState<"csv" | "json">("csv");
  const [loteEstado, setLoteEstado] = useState<"" | EstadoReporte>("");
  const [loteNota, setLoteNota] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  const irAlLogin = useCallback(() => router.replace("/admin/login"), [router]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    const parametros = new URLSearchParams();
    if (estado) parametros.set("estado", estado);
    if (q.trim()) parametros.set("q", q.trim());

    try {
      const respuesta = await fetch(`/api/admin/reportes?${parametros}`, { cache: "no-store" });

      if (respuesta.status === 401) {
        irAlLogin();
        return;
      }

      const datos = await leerRespuesta(respuesta);
      if (!datos.ok) throw new Error(datos.mensaje);

      const lista = (datos.reportes as Reporte[] | undefined) ?? [];
      setReportes(lista);
      setTotal(typeof datos.total === "number" ? datos.total : lista.length);

      // Solo se conserva lo seleccionado que sigue visible.
      const visibles = new Set(lista.map((r) => r.id));
      setSeleccion((previa) => new Set([...previa].filter((id) => visibles.has(id))));
    } catch (fallo) {
      setError(fallo instanceof Error && fallo.message ? fallo.message : "No pudimos cargar los reportes.");
    } finally {
      setCargando(false);
    }
  }, [estado, q, irAlLogin]);

  useEffect(() => {
    const espera = window.setTimeout(() => void cargar(), 250);
    return () => window.clearTimeout(espera);
  }, [cargar]);

  async function cambiar(reporte: Reporte, nuevo: EstadoReporte) {
    if (nuevo === reporte.estado || guardando) return;
    setGuardando(reporte.id);
    setError(null);
    setAviso(null);

    try {
      const respuesta = await fetch(`/api/admin/reportes/${reporte.id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ estado: nuevo, nota: notas[reporte.id] ?? "" }),
      });

      if (respuesta.status === 401) {
        irAlLogin();
        return;
      }

      const datos = await leerRespuesta(respuesta);
      if (!datos.ok) throw new Error(datos.mensaje);

      setReportes((previos) =>
        previos.map((item) => (item.id === reporte.id ? { ...item, estado: nuevo } : item)),
      );
      setNotas((previas) => ({ ...previas, [reporte.id]: "" }));
    } catch (fallo) {
      setError(fallo instanceof Error && fallo.message ? fallo.message : "No pudimos cambiar el estado.");
    } finally {
      setGuardando(null);
    }
  }

  function alternar(id: string) {
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      if (!siguiente.delete(id)) siguiente.add(id);
      return siguiente;
    });
  }

  const todosMarcados = reportes.length > 0 && seleccion.size === reportes.length;

  function alternarTodos() {
    setSeleccion(todosMarcados ? new Set() : new Set(reportes.map((r) => r.id)));
  }

  function alternarGrupo(ids: string[]) {
    setSeleccion((previa) => {
      const siguiente = new Set(previa);
      const todos = ids.every((id) => siguiente.has(id));

      for (const id of ids) {
        if (todos) siguiente.delete(id);
        else siguiente.add(id);
      }

      return siguiente;
    });
  }

  /** Agrupa por cédula conservando el orden de llegada (más reciente primero). */
  const grupos = useMemo(() => {
    const mapa = new Map<
      string,
      { ci: string; nombre: string; correo: string; reportes: Reporte[] }
    >();

    for (const reporte of reportes) {
      const grupo = mapa.get(reporte.ci);

      if (grupo) {
        grupo.reportes.push(reporte);
      } else {
        mapa.set(reporte.ci, {
          ci: reporte.ci,
          nombre: reporte.nombre,
          correo: reporte.correo,
          reportes: [reporte],
        });
      }
    }

    return [...mapa.values()];
  }, [reportes]);

  const todosContraidos =
    grupos.length > 0 && grupos.every((grupo) => contraidos.has(grupo.ci));

  function alternarContraido(ci: string) {
    setContraidos((previa) => {
      const siguiente = new Set(previa);
      if (!siguiente.delete(ci)) siguiente.add(ci);
      return siguiente;
    });
  }

  function alternarTodosContraidos() {
    setContraidos(
      todosContraidos ? new Set() : new Set(grupos.map((grupo) => grupo.ci)),
    );
  }

  async function descargar(modo: "seleccion" | "filtro") {
    if (trabajando) return;
    if (modo === "seleccion" && seleccion.size === 0) return;

    setTrabajando(true);
    setError(null);
    setAviso(null);

    try {
      const cuerpo =
        modo === "seleccion"
          ? { accion: "descargar", formato, ids: [...seleccion] }
          : { accion: "descargar", formato, estado, q: q.trim() };

      const respuesta = await fetch("/api/admin/reportes", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(cuerpo),
      });

      if (respuesta.status === 401) {
        irAlLogin();
        return;
      }

      if (!respuesta.ok) {
        const datos = await leerRespuesta(respuesta);
        throw new Error(datos.mensaje ?? "No pudimos descargar los reportes.");
      }

      const archivo = await respuesta.blob();
      const nombre =
        /filename="([^"]+)"/.exec(respuesta.headers.get("Content-Disposition") ?? "")?.[1] ??
        `reportes.${formato}`;

      const enlace = document.createElement("a");
      enlace.href = URL.createObjectURL(archivo);
      enlace.download = nombre;
      document.body.append(enlace);
      enlace.click();
      enlace.remove();
      window.setTimeout(() => URL.revokeObjectURL(enlace.href), 10_000);

      const descargados = Number(respuesta.headers.get("X-Reportes-Total") ?? 0);
      const marcados = Number(respuesta.headers.get("X-Reportes-Marcados") ?? 0);
      const truncado = respuesta.headers.get("X-Reportes-Truncado") === "1";

      setAviso(
        `Se descargaron ${descargados} reporte(s)` +
          (marcados > 0 ? `; ${marcados} pasaron a «En revisión».` : ".") +
          (truncado ? " Había más: se descargó el máximo permitido, acota el filtro." : ""),
      );

      await cargar();
    } catch (fallo) {
      setError(fallo instanceof Error && fallo.message ? fallo.message : "No pudimos descargar los reportes.");
    } finally {
      setTrabajando(false);
    }
  }

  async function cambiarLote() {
    if (trabajando || !loteEstado || seleccion.size === 0) return;

    const etiqueta = getEstadoReporteLabel(loteEstado);
    if (!window.confirm(`¿Pasar ${seleccion.size} reporte(s) a «${etiqueta}»?`)) return;

    setTrabajando(true);
    setError(null);
    setAviso(null);

    try {
      const respuesta = await fetch("/api/admin/reportes", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          accion: "estado",
          ids: [...seleccion],
          estado: loteEstado,
          nota: loteNota,
        }),
      });

      if (respuesta.status === 401) {
        irAlLogin();
        return;
      }

      const datos = await leerRespuesta(respuesta);
      if (!datos.ok) throw new Error(datos.mensaje);

      setAviso(`${String(datos.cambiados ?? 0)} de ${seleccion.size} reporte(s) pasaron a «${etiqueta}».`);
      setLoteNota("");
      setSeleccion(new Set());
      await cargar();
    } catch (fallo) {
      setError(fallo instanceof Error && fallo.message ? fallo.message : "No pudimos cambiar el estado.");
    } finally {
      setTrabajando(false);
    }
  }

  async function salir() {
    try {
      await postJson("/api/admin/logout", {});
    } finally {
      irAlLogin();
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Reportes de horarios</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button type="button" onClick={salir} className={botonSecundario}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por ticket, cédula, NRC o código" aria-label="Buscar reportes"
          className={`${campo} min-w-0 flex-1`} />
        <select value={estado} onChange={(e) => setEstado(e.target.value as "" | EstadoReporte)}
          aria-label="Filtrar por estado" className={campo}>
          <option value="">Todos los estados</option>
          {ESTADOS_REPORTE.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
      </div>

      <section aria-label="Acciones por lote"
        className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm">
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={todosMarcados} onChange={alternarTodos}
            disabled={reportes.length === 0} className="h-4 w-4" />
          Seleccionar visibles ({seleccion.size})
        </label>

        <select value={formato} onChange={(e) => setFormato(e.target.value as "csv" | "json")}
          aria-label="Formato de descarga" className={campo}>
          <option value="csv">CSV (Excel)</option>
          <option value="json">JSON (app de ingreso)</option>
        </select>

        <button type="button" disabled={trabajando || seleccion.size === 0}
          onClick={() => void descargar("seleccion")} className={botonPrimario}>
          Descargar seleccionados
        </button>
        <button type="button" disabled={trabajando || total === 0}
          onClick={() => void descargar("filtro")} className={botonSecundario}>
          Descargar todos ({total}, según filtro)
        </button>

        <div className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
          <select value={loteEstado} onChange={(e) => setLoteEstado(e.target.value as "" | EstadoReporte)}
            aria-label="Nuevo estado para la selección" className={campo}>
            <option value="">Cambiar estado de la selección…</option>
            {ESTADOS_REPORTE.map((e) => (
              <option key={e.value} value={e.value}>{e.label}</option>
            ))}
          </select>
          <input type="text" maxLength={500} value={loteNota} onChange={(e) => setLoteNota(e.target.value)}
            placeholder="Nota (opcional)" aria-label="Nota para el lote" className={`${campo} min-w-0 flex-1`} />
          <button type="button" disabled={trabajando || seleccion.size === 0 || !loteEstado}
            onClick={() => void cambiarLote()} className={botonPrimario}>
            Aplicar a {seleccion.size}
          </button>
        </div>

        <p className="w-full text-xs text-slate-500 dark:text-slate-400">
          Al descargar, los reportes «Pendiente de revisión» pasan automáticamente a «En revisión».
        </p>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>
      )}
      {aviso && (
        <p role="status" className="mt-4 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{aviso}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
          {cargando
            ? "Cargando..."
            : `Mostrando ${reportes.length} de ${total} reporte(s) en ${grupos.length} cédula(s) (los 200 más recientes)`}
        </p>
        {grupos.length > 0 && (
          <button
            type="button"
            onClick={alternarTodosContraidos}
            className="text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {todosContraidos ? "Expandir todas las cédulas" : "Contraer todas las cédulas"}
          </button>
        )}
      </div>

      <ul className="mt-3 space-y-4">
        {grupos.map((grupo) => {
          const idsGrupo = grupo.reportes.map((r) => r.id);
          const seleccionados = idsGrupo.filter((id) => seleccion.has(id)).length;
          const todosGrupo = seleccionados === idsGrupo.length;
          const parcial = seleccionados > 0 && !todosGrupo;
          const contraido = contraidos.has(grupo.ci);

          return (
            <li
              key={grupo.ci}
              className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-800/40">
                <div className="flex min-w-0 items-start gap-3">
                  <CheckboxGrupo
                    marcado={todosGrupo}
                    parcial={parcial}
                    etiqueta={`Seleccionar todos los tickets de la cédula ${grupo.ci}`}
                    onChange={() => alternarGrupo(idsGrupo)}
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Cédula
                    </p>
                    <p className="font-mono text-lg font-bold tracking-wide text-slate-900 dark:text-slate-100">
                      {grupo.ci}
                    </p>
                    <p className="mt-0.5 break-all text-xs text-slate-600 dark:text-slate-400">
                      {grupo.nombre} · {grupo.correo}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300">
                    {grupo.reportes.length} ticket{grupo.reportes.length === 1 ? "" : "s"}
                  </span>

                  <button
                    type="button"
                    onClick={() => alternarContraido(grupo.ci)}
                    aria-expanded={!contraido}
                    aria-controls={`tickets-${grupo.ci}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  >
                    {contraido ? "Mostrar" : "Ocultar"}
                    <ChevronDownIcon
                      className={`size-3.5 transition-transform ${contraido ? "" : "rotate-180"}`}
                    />
                  </button>
                </div>
              </div>

              <ul
                id={`tickets-${grupo.ci}`}
                hidden={contraido}
                className="divide-y divide-slate-100 dark:divide-slate-800"
              >
                {grupo.reportes.map((r) => (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 gap-3">
                        <input type="checkbox" checked={seleccion.has(r.id)} onChange={() => alternar(r.id)}
                          aria-label={`Seleccionar ${r.ticket}`} className="mt-1 h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="font-mono text-sm font-bold text-indigo-700 dark:text-indigo-300">{r.ticket}</p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-800 dark:text-slate-200">
                            {r.materiaNombre} <span className="font-normal text-slate-500 dark:text-slate-400">· NRC {r.nrc} · {r.materiaCodigo}</span>
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                            {getTipoErrorLabel(r.tipo_error)}
                            {r.tipoErrorDetalle ? ` (${r.tipoErrorDetalle})` : ""} · {formatoFecha.format(new Date(r.creadoEn))}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                        {getEstadoReporteLabel(r.estado)}
                      </span>
                    </div>

                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-300">{r.motivo}</p>
                    <p className="mt-1.5 break-all text-xs text-slate-500 dark:text-slate-400">
                      {r.nombre} · {r.correo}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input type="text" maxLength={500} placeholder="Nota (opcional)" aria-label={`Nota para ${r.ticket}`}
                        value={notas[r.id] ?? ""} onChange={(e) => setNotas((p) => ({ ...p, [r.id]: e.target.value }))}
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500" />
                      {ESTADOS_REPORTE.filter((e) => e.value !== r.estado).map((e) => (
                        <button key={e.value} type="button" disabled={guardando === r.id} onClick={() => void cambiar(r, e.value)}
                          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-400">
                          Pasar a «{e.label}»
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <PanelAdministradores miUserId={miUserId} onSesionCaducada={irAlLogin} />
    </main>
  );
}

// ── Gestión de administradores ──────────────────────────────────────────────

interface AdministradorFila {
  userId: string;
  email: string;
  creadoEn: string;
}

function PanelAdministradores({
  miUserId,
  onSesionCaducada,
}: {
  miUserId: string;
  onSesionCaducada: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [lista, setLista] = useState<AdministradorFila[]>([]);
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [cargando, setCargando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    try {
      const respuesta = await fetch("/api/admin/administradores", { cache: "no-store" });

      if (respuesta.status === 401) {
        onSesionCaducada();
        return;
      }

      const datos = await leerRespuesta(respuesta);
      if (!datos.ok) throw new Error(datos.mensaje);
      setLista((datos.administradores as AdministradorFila[] | undefined) ?? []);
    } catch (fallo) {
      setError(fallo instanceof Error && fallo.message ? fallo.message : "No pudimos cargar los administradores.");
    } finally {
      setCargando(false);
    }
  }, [onSesionCaducada]);

  useEffect(() => {
    if (abierto) void cargar();
  }, [abierto, cargar]);

  async function agregar(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);
    setAviso(null);

    try {
      const respuesta = await fetch("/api/admin/administradores", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ correo, clave }),
      });

      if (respuesta.status === 401) {
        onSesionCaducada();
        return;
      }

      const datos = await leerRespuesta(respuesta);
      if (!datos.ok) throw new Error(datos.mensaje);

      setAviso(
        datos.creado
          ? "Usuario creado y autorizado. Comparte la contraseña temporal por un canal seguro."
          : "Usuario autorizado como administrador.",
      );
      setCorreo("");
      setClave("");
      await cargar();
    } catch (fallo) {
      setError(fallo instanceof Error && fallo.message ? fallo.message : "No pudimos agregar al administrador.");
    } finally {
      setEnviando(false);
    }
  }

  async function quitar(fila: AdministradorFila) {
    if (enviando || !window.confirm(`¿Quitar el acceso de administrador a ${fila.email}?`)) return;

    setEnviando(true);
    setError(null);
    setAviso(null);

    try {
      const respuesta = await fetch(`/api/admin/administradores?id=${encodeURIComponent(fila.userId)}`, {
        method: "DELETE",
      });

      if (respuesta.status === 401) {
        onSesionCaducada();
        return;
      }

      const datos = await leerRespuesta(respuesta);
      if (!datos.ok) throw new Error(datos.mensaje);

      setAviso(`Se quitó el acceso a ${fila.email}.`);
      await cargar();
    } catch (fallo) {
      setError(fallo instanceof Error && fallo.message ? fallo.message : "No pudimos quitar al administrador.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="mt-10 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
        className="flex w-full items-center justify-between text-left text-sm font-semibold text-slate-800 dark:text-slate-200">
        Administradores
        <span aria-hidden="true">{abierto ? "−" : "+"}</span>
      </button>

      {abierto && (
        <div className="mt-4 space-y-4">
          {error && (
            <p role="alert" className="rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>
          )}
          {aviso && (
            <p role="status" className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-300">{aviso}</p>
          )}

          <ul className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
            {cargando && lista.length === 0 && <li className="py-2 text-slate-500 dark:text-slate-400">Cargando...</li>}
            {lista.map((fila) => (
              <li key={fila.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="break-all text-slate-800 dark:text-slate-200">
                  {fila.email}
                  {fila.userId === miUserId && <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">(tú)</span>}
                </span>
                {fila.userId !== miUserId && (
                  <button type="button" disabled={enviando} onClick={() => void quitar(fila)}
                    className="rounded-lg border border-rose-200 dark:border-rose-500/30 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-500/15 disabled:opacity-50">
                    Quitar acceso
                  </button>
                )}
              </li>
            ))}
          </ul>

          <form onSubmit={agregar} className="flex flex-wrap items-end gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="min-w-0 flex-1">
              <label htmlFor="nuevo-admin-correo" className="block text-xs font-medium text-slate-600 dark:text-slate-400">Correo</label>
              <input id="nuevo-admin-correo" type="email" required value={correo}
                onChange={(e) => setCorreo(e.target.value)} className={`${campo} mt-1 w-full`} />
            </div>
            <div className="min-w-0 flex-1">
              <label htmlFor="nuevo-admin-clave" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Contraseña temporal (solo si el usuario aún no existe)
              </label>
              <input id="nuevo-admin-clave" type="password" minLength={10} maxLength={72}
                autoComplete="new-password" value={clave}
                onChange={(e) => setClave(e.target.value)} className={`${campo} mt-1 w-full`} />
            </div>
            <button type="submit" disabled={enviando} className={botonPrimario}>
              {enviando ? "Guardando..." : "Autorizar"}
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
