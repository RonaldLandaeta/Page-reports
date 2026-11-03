"use client";

import { useEffect, useRef, useState } from "react";

import {
  getEstadoReporteLabel,
  getTipoErrorLabel,
} from "@/lib/catalogos";
import type { Reporte } from "@/lib/types";

import {
  CheckIcon,
  CloseIcon,
  CopyIcon,
  DocumentIcon,
  MailIcon,
} from "./icons";

interface ModalExitoProps {
  reporte: Reporte;
  onClose: () => void;
  /** Cierra el modal y prepara el formulario con los datos anteriores. */
  onHacerOtro: () => void;
}

export function ModalExito({
  reporte,
  onClose,
  onHacerOtro,
}: ModalExitoProps) {
  const [copiado, setCopiado] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement>(null);
  // Ref para que un onClose nuevo en cada render no reinicie foco ni scroll.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    cerrarRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCloseRef.current();
      }
    }

    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = overflowPrevio;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!copiado) return;

    const timeout = window.setTimeout(() => setCopiado(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copiado]);

  async function copiarTicket() {
    try {
      await navigator.clipboard.writeText(reporte.ticket);
      setCopiado(true);
    } catch {
      // El navegador puede bloquear el portapapeles; el código sigue visible.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Cerrar alerta de éxito"
        onClick={onClose}
        className="animate-fade-in absolute inset-0 h-full w-full cursor-default bg-slate-900/50 dark:bg-black/70 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-reporte-exitoso"
        className="animate-modal-in relative w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-slate-900/5 dark:ring-white/10"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 dark:border-slate-800 px-6 py-5">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400">
              <CheckIcon className="size-6" />
            </span>
            <div>
              <h2
                id="titulo-reporte-exitoso"
                className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100"
              >
                Reporte registrado
              </h2>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
                Recibimos tu reporte correctamente. El equipo de horarios lo
                revisará.
              </p>
            </div>
          </div>

          <button
            ref={cerrarRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 dark:text-slate-400 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Código de ticket
          </p>

          <div className="mt-2 flex items-center gap-3 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-500/40 bg-indigo-50/70 dark:bg-indigo-500/10 px-4 py-3">
            <span className="flex-1 font-mono text-xl font-semibold tracking-wider text-indigo-700 dark:text-indigo-300">
              {reporte.ticket}
            </span>
            <button
              type="button"
              onClick={copiarTicket}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 shadow-sm transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              <CopyIcon className="size-3.5" />
              {copiado ? "Copiado" : "Copiar"}
            </button>
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-500 dark:text-slate-400">Materia</dt>
              <dd className="text-right font-medium text-slate-800 dark:text-slate-200">
                {reporte.materiaNombre}
                <span className="block text-xs font-normal text-slate-500 dark:text-slate-400">
                  NRC {reporte.nrc} · {reporte.materiaCodigo}
                </span>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-500 dark:text-slate-400">Tipo de error</dt>
              <dd className="text-right font-medium text-slate-800 dark:text-slate-200">
                {getTipoErrorLabel(reporte.tipo_error)}
                {reporte.tipoErrorDetalle && (
                  <span className="block break-words text-xs font-normal text-slate-500 dark:text-slate-400">
                    {reporte.tipoErrorDetalle}
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-500 dark:text-slate-400">Estado</dt>
              <dd className="text-right font-medium text-slate-800 dark:text-slate-200">
                {getEstadoReporteLabel(reporte.estado)}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4">
              <dt className="shrink-0 text-slate-500 dark:text-slate-400">Reportado por</dt>
              <dd className="text-right font-medium text-slate-800 dark:text-slate-200">
                {reporte.nombre}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5 text-xs leading-5 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-100 dark:ring-emerald-500/30">
            <MailIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p>
              Confirmación enviada a{" "}
              <span className="font-semibold">{reporte.correo}</span>.
            </p>
          </div>

          <p className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:text-amber-300 ring-1 ring-amber-100 dark:ring-amber-500/30">
            Guarda tu código de ticket. Lo necesitarás, junto con tu cédula,
            para consultar el estado de este reporte.
          </p>
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 px-6 py-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onHacerOtro}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <DocumentIcon className="size-4" />
              Hacer otro reporte
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 active:bg-indigo-800"
            >
              Entendido
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] leading-4 text-slate-500 dark:text-slate-400">
            «Hacer otro reporte» conserva tu cédula, nombre, correo y la
            verificación para agilizar el siguiente ticket.
          </p>
        </div>
      </div>
    </div>
  );
}
