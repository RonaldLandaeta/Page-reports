"use client";

import { useReportes } from "@/context/ReportesContext";
import { TIPOS_ERROR, getTipoErrorLabel } from "@/lib/catalogos";
import { CONFIG } from "@/lib/config";

import { ClockIcon, InboxIcon } from "./icons";

const formatoHora = new Intl.DateTimeFormat("es-EC", {
  hour: "2-digit",
  minute: "2-digit",
});

export function ResumenReportes() {
  const { reportes, hidratado } = useReportes();
  const total = reportes.length;

  const desglose = TIPOS_ERROR.map((tipo) => ({
    ...tipo,
    total: reportes.filter((reporte) => reporte.tipo_error === tipo.value).length,
  }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);

  return (
    <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">
            Reportes registrados
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Estado global persistido en este navegador.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Local
        </span>
      </div>

      <div
        aria-live="polite"
        className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
      >
        <p className="text-xs font-medium text-slate-500">Total registrados</p>
        <p className="mt-0.5 text-3xl font-bold tracking-tight text-slate-900">
          {hidratado ? total : "—"}
        </p>
      </div>

      {!hidratado ? (
        <div className="mt-5 space-y-2" aria-hidden="true">
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-12 animate-pulse rounded-lg bg-slate-100" />
        </div>
      ) : total === 0 ? (
        <div className="mt-5 flex flex-col items-center rounded-xl border border-dashed border-slate-200 px-4 py-7 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <InboxIcon className="size-5" />
          </span>
          <p className="mt-3 text-sm font-medium text-slate-700">
            Aún no hay reportes
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Cuando envíes el formulario, el ticket aparecerá aquí.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Por tipo de error
            </h3>
            <ul className="mt-3 space-y-3">
              {desglose.map((item) => (
                <li key={item.value}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-slate-700">
                      {item.label}
                    </span>
                    <span className="shrink-0 font-semibold text-slate-500">
                      {item.total}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-indigo-500"
                      style={{ width: `${(item.total / total) * 100}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Recientes
            </h3>
            <ul className="mt-3 space-y-2">
              {reportes.slice(0, 4).map((reporte) => (
                <li
                  key={reporte.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-700">
                      {reporte.materiaNombre}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-500">
                      {reporte.ticket} · {getTipoErrorLabel(reporte.tipo_error)}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-400">
                    <ClockIcon className="size-3" />
                    {formatoHora.format(new Date(reporte.creadoEn))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="text-[11px] leading-5 text-slate-400">
          Máximo {CONFIG.maxReportesPorDia} reportes por día · Sin duplicados
          en {CONFIG.ventanaDuplicadosHoras} h.
        </p>
        <p className="mt-1 text-[11px] leading-5 text-slate-400">
          Los datos viven en localStorage y se borran al limpiar el navegador.
        </p>
      </div>
    </aside>
  );
}
