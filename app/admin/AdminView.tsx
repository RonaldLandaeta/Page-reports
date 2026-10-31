"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  ESTADOS_REPORTE,
  getEstadoReporteLabel,
  getTipoErrorLabel,
} from "@/lib/catalogos";
import { postJson } from "@/lib/api-cliente";
import type { EstadoReporte, Reporte } from "@/lib/types";

const formatoFecha = new Intl.DateTimeFormat("es-VE", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AdminView() {
  const router = useRouter();
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [estado, setEstado] = useState<"" | EstadoReporte>("");
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [notas, setNotas] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);

    const parametros = new URLSearchParams();
    if (estado) parametros.set("estado", estado);
    if (q.trim()) parametros.set("q", q.trim());

    try {
      const respuesta = await fetch(`/api/admin/reportes?${parametros}`, { cache: "no-store" });

      if (respuesta.status === 401) {
        router.replace("/admin/login");
        return;
      }

      const datos = (await respuesta.json()) as { ok: boolean; reportes?: Reporte[]; mensaje?: string };
      if (!datos.ok) throw new Error(datos.mensaje);
      setReportes(datos.reportes ?? []);
    } catch (fallo) {
      setError(fallo instanceof Error && fallo.message ? fallo.message : "No pudimos cargar los reportes.");
    } finally {
      setCargando(false);
    }
  }, [estado, q, router]);

  useEffect(() => {
    const espera = window.setTimeout(() => void cargar(), 250);
    return () => window.clearTimeout(espera);
  }, [cargar]);

  async function cambiar(reporte: Reporte, nuevo: EstadoReporte) {
    if (nuevo === reporte.estado || guardando) return;
    setGuardando(reporte.id);
    setError(null);

    try {
      const respuesta = await fetch(`/api/admin/reportes/${reporte.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: nuevo, nota: notas[reporte.id] ?? "" }),
      });

      if (respuesta.status === 401) {
        router.replace("/admin/login");
        return;
      }

      const datos = (await respuesta.json()) as { ok: boolean; mensaje?: string };
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

  async function salir() {
    try {
      await postJson("/api/admin/logout", {});
    } finally {
      router.replace("/admin/login");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reportes de horarios</h1>
        <button type="button" onClick={salir}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Cerrar sesión
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por ticket, cédula, NRC o código" aria-label="Buscar reportes"
          className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10" />
        <select value={estado} onChange={(e) => setEstado(e.target.value as "" | EstadoReporte)}
          aria-label="Filtrar por estado"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="">Todos los estados</option>
          {ESTADOS_REPORTE.map((e) => (
            <option key={e.value} value={e.value}>{e.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}

      <p className="mt-4 text-xs text-slate-500" aria-live="polite">
        {cargando ? "Cargando..." : `${reportes.length} reporte(s) (máximo 200 más recientes)`}
      </p>

      <ul className="mt-3 space-y-3">
        {reportes.map((r) => (
          <li key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold text-indigo-700">{r.ticket}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">
                  {r.materiaNombre} <span className="font-normal text-slate-500">· NRC {r.nrc} · {r.materiaCodigo}</span>
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {getTipoErrorLabel(r.tipo_error)}
                  {r.tipoErrorDetalle ? ` (${r.tipoErrorDetalle})` : ""} · {formatoFecha.format(new Date(r.creadoEn))}
                </p>
              </div>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {getEstadoReporteLabel(r.estado)}
              </span>
            </div>

            <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">{r.motivo}</p>
            <p className="mt-2 break-all text-xs text-slate-500">
              {r.nombre} · CI {r.ci} · {r.correo}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input type="text" maxLength={500} placeholder="Nota (opcional)" aria-label={`Nota para ${r.ticket}`}
                value={notas[r.id] ?? ""} onChange={(e) => setNotas((p) => ({ ...p, [r.id]: e.target.value }))}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs" />
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
    </main>
  );
}
