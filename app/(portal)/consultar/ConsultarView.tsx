"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";

import {
  AlertIcon,
  ArrowRightIcon,
  ClockIcon,
  DocumentIcon,
  MailIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/icons";
import { useReportes } from "@/context/ReportesContext";
import { getEstadoReporteLabel, getTipoErrorLabel } from "@/lib/catalogos";
import type { EstadoReporte, Reporte } from "@/lib/types";
import {
  CEDULA_MAX_DIGITOS,
  CEDULA_MIN_DIGITOS,
  TICKET_MAX_LONGITUD,
  esCedulaValida,
  esTicketValido,
  normalizarTicket,
} from "@/lib/validaciones";

const ESTILOS_ESTADO: Record<EstadoReporte, string> = {
  pendiente: "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "en-revision": "border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
  resuelto: "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

const formatoFecha = new Intl.DateTimeFormat("es-VE", {
  dateStyle: "medium",
  timeStyle: "short",
});

interface ErroresConsulta {
  ticket?: string;
  ci?: string;
  general?: string;
}

function Dato({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500 dark:text-slate-400">{etiqueta}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-200">{children}</dd>
    </div>
  );
}

export function ConsultarView() {
  const { buscarReporte } = useReportes();

  const [ticket, setTicket] = useState("");
  const [ci, setCi] = useState("");
  const [errores, setErrores] = useState<ErroresConsulta>({});
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [consultando, setConsultando] = useState(false);

  function limpiarError(campo: "ticket" | "ci") {
    setErrores((previos) => {
      const siguientes = { ...previos };
      delete siguientes[campo];
      delete siguientes.general;
      return siguientes;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (consultando) return;

    const nuevosErrores: ErroresConsulta = {};

    if (!esTicketValido(ticket)) {
      nuevosErrores.ticket =
        "Ingresa un ticket válido con formato TK-1234567 (7 dígitos).";
    }

    if (!esCedulaValida(ci)) {
      nuevosErrores.ci = `Ingresa la cédula de ${CEDULA_MIN_DIGITOS} a ${CEDULA_MAX_DIGITOS} dígitos del reporte.`;
    }

    setErrores(nuevosErrores);
    setReporte(null);

    if (Object.keys(nuevosErrores).length > 0) {
      const primerCampo = Object.keys(nuevosErrores)[0];
      document.getElementById(primerCampo)?.focus();
      return;
    }

    setConsultando(true);

    try {
      const encontrado = await buscarReporte(normalizarTicket(ticket), ci);

      if (!encontrado) {
        setErrores({
          general:
            "No encontramos un reporte con ese ticket y cédula. Verifica ambos datos o revisa el correo de confirmación.",
        });
        return;
      }

      setReporte(encontrado);
    } catch (error) {
      setErrores({
        general:
          error instanceof Error
            ? error.message
            : "No pudimos consultar el reporte. Intenta de nuevo en unos segundos.",
      });
    } finally {
      setConsultando(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-100 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-300">
          <SearchIcon className="size-3.5" />
          Consulta protegida
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Consulta el estado de tu reporte
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-400">
          Ingresa el código de ticket y la cédula con la que registraste el
          problema. Por seguridad, ambos datos deben coincidir.
        </p>
      </div>

      <form
        noValidate
        onSubmit={handleSubmit}
        className="mt-7 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
      >
        <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Datos del reporte
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            El ticket aparece en el correo de confirmación y en el modal de
            éxito.
          </p>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ticket"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Código de ticket <span className="text-rose-500 dark:text-rose-400">*</span>
              </label>
              <input
                id="ticket"
                name="ticket"
                type="text"
                autoComplete="off"
                maxLength={TICKET_MAX_LONGITUD}
                placeholder="Ej. TK-8392012"
                value={ticket}
                onChange={(event) => {
                  setTicket(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9-]/g, "")
                      .slice(0, TICKET_MAX_LONGITUD),
                  );
                  setReporte(null);
                  limpiarError("ticket");
                }}
                required
                aria-invalid={Boolean(errores.ticket)}
                aria-describedby={errores.ticket ? "ticket-error" : undefined}
                className={`w-full rounded-xl border bg-white dark:bg-slate-900 px-3.5 py-2.5 font-mono text-sm tracking-wider text-slate-900 dark:text-slate-100 transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-4 ${
                  errores.ticket
                    ? "border-rose-400 dark:border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/10"
                    : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-500 focus:ring-indigo-500/10"
                }`}
              />
              {errores.ticket && (
                <p
                  id="ticket-error"
                  role="alert"
                  className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400"
                >
                  <AlertIcon className="mt-px size-3.5 shrink-0" />
                  {errores.ticket}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="ci"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Cédula <span className="text-rose-500 dark:text-rose-400">*</span>
              </label>
              <input
                id="ci"
                name="ci"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={CEDULA_MAX_DIGITOS}
                placeholder="Ej. 12345678"
                value={ci}
                onChange={(event) => {
                  setCi(
                    event.target.value.replace(/\D/g, "").slice(0, CEDULA_MAX_DIGITOS),
                  );
                  setReporte(null);
                  limpiarError("ci");
                }}
                required
                aria-invalid={Boolean(errores.ci)}
                aria-describedby={errores.ci ? "consulta-ci-error" : undefined}
                className={`w-full rounded-xl border bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 transition-colors placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-4 ${
                  errores.ci
                    ? "border-rose-400 dark:border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/10"
                    : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-500 focus:ring-indigo-500/10"
                }`}
              />
              {errores.ci && (
                <p
                  id="consulta-ci-error"
                  role="alert"
                  className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600 dark:text-rose-400"
                >
                  <AlertIcon className="mt-px size-3.5 shrink-0" />
                  {errores.ci}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 dark:border-slate-800 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
              <ShieldIcon className="mt-0.5 size-4 shrink-0 text-slate-400 dark:text-slate-400" />
              No mostramos datos sin la cédula registrada.
            </p>
            <button
              type="submit"
              disabled={consultando}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 active:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {consultando ? (
                <>
                  <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  Consultando...
                </>
              ) : (
                <>
                  <SearchIcon className="size-4" />
                  Consultar estado
                </>
              )}
            </button>
          </div>
        </div>
      </form>

      <div aria-live="polite">
        {errores.general && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-sm leading-6 text-rose-700 dark:text-rose-300"
          >
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <p>{errores.general}</p>
          </div>
        )}

        {reporte && (
          <section
            aria-labelledby="resultado-ticket"
            className="animate-fade-in mt-6 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm"
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                  <DocumentIcon className="size-5" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Ticket
                  </p>
                  <h2
                    id="resultado-ticket"
                    className="font-mono text-lg font-semibold tracking-wider text-slate-900 dark:text-slate-100"
                  >
                    {reporte.ticket}
                  </h2>
                </div>
              </div>

              <span
                className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-xs font-semibold ${ESTILOS_ESTADO[reporte.estado]}`}
              >
                {getEstadoReporteLabel(reporte.estado)}
              </span>
            </div>

            <dl className="grid gap-5 px-5 py-5 sm:grid-cols-2">
              <Dato etiqueta="Materia">
                {reporte.materiaNombre}
                <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">
                  NRC {reporte.nrc} · {reporte.materiaCodigo}
                </span>
              </Dato>
              <Dato etiqueta="Tipo de error">
                {getTipoErrorLabel(reporte.tipo_error)}
                {reporte.tipoErrorDetalle && (
                  <span className="mt-0.5 block break-words text-xs font-normal text-slate-500 dark:text-slate-400">
                    {reporte.tipoErrorDetalle}
                  </span>
                )}
              </Dato>
              <Dato etiqueta="Fecha de registro">
                {formatoFecha.format(new Date(reporte.creadoEn))}
              </Dato>
              <Dato etiqueta="Reportado por">
                {reporte.nombre}
                <span className="mt-0.5 block text-xs font-normal text-slate-500 dark:text-slate-400">
                  CI {reporte.ci}
                </span>
              </Dato>
              <Dato etiqueta="Correo">
                <span className="break-all">{reporte.correo}</span>
              </Dato>
            </dl>

            <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Motivo</p>
              <p className="mt-1 text-sm leading-6 text-slate-700 dark:text-slate-300">
                {reporte.motivo}
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <ShieldIcon className="size-3.5" />
                Consulta validada con ticket y cédula.
              </p>
              <Link
                href="/reportar"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200"
              >
                Reportar otro problema
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </section>
        )}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <span className="flex size-9 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <MailIcon className="size-4" />
          </span>
          <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            ¿Dónde está mi ticket?
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Se muestra al enviar el reporte y se envía al correo registrado.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/15 text-violet-600 dark:text-violet-400">
            <ClockIcon className="size-4" />
          </span>
          <h2 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Estados del reporte
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Pendiente de revisión → En revisión → Resuelto. El panel
            administrativo se integrará en una siguiente etapa.
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] leading-5 text-slate-400 dark:text-slate-400">
        La consulta se valida en el servidor: el ticket y la cédula deben
        coincidir.
      </p>
    </div>
  );
}
