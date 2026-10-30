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
  esCedulaValida,
  esTicketValido,
  normalizarTicket,
} from "@/lib/validaciones";

const ESTILOS_ESTADO: Record<EstadoReporte, string> = {
  pendiente: "border-amber-200 bg-amber-50 text-amber-700",
  "en-revision": "border-sky-200 bg-sky-50 text-sky-700",
  resuelto: "border-emerald-200 bg-emerald-50 text-emerald-700",
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
      <dt className="text-xs font-medium text-slate-500">{etiqueta}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-800">{children}</dd>
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
      nuevosErrores.ticket = "Ingresa un ticket válido con formato TK-000000.";
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
        <span className="inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
          <SearchIcon className="size-3.5" />
          Consulta protegida
        </span>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Consulta el estado de tu reporte
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Ingresa el código de ticket y la cédula con la que registraste el
          problema. Por seguridad, ambos datos deben coincidir.
        </p>
      </div>

      <form
        noValidate
        onSubmit={handleSubmit}
        className="mt-7 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold text-slate-900">
            Datos del reporte
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            El ticket aparece en el correo de confirmación y en el modal de
            éxito.
          </p>
        </div>

        <div className="px-5 py-5 sm:px-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ticket"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Código de ticket <span className="text-rose-500">*</span>
              </label>
              <input
                id="ticket"
                name="ticket"
                type="text"
                autoComplete="off"
                maxLength={9}
                placeholder="Ej. TK-839201"
                value={ticket}
                onChange={(event) => {
                  setTicket(
                    event.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9-]/g, "")
                      .slice(0, 9),
                  );
                  setReporte(null);
                  limpiarError("ticket");
                }}
                required
                aria-invalid={Boolean(errores.ticket)}
                aria-describedby={errores.ticket ? "ticket-error" : undefined}
                className={`w-full rounded-xl border bg-white px-3.5 py-2.5 font-mono text-sm tracking-wider text-slate-900 transition-colors placeholder:font-sans placeholder:tracking-normal placeholder:text-slate-400 focus:outline-none focus:ring-4 ${
                  errores.ticket
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10"
                    : "border-slate-300 hover:border-slate-400 focus:border-indigo-500 focus:ring-indigo-500/10"
                }`}
              />
              {errores.ticket && (
                <p
                  id="ticket-error"
                  role="alert"
                  className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600"
                >
                  <AlertIcon className="mt-px size-3.5 shrink-0" />
                  {errores.ticket}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="ci"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Cédula <span className="text-rose-500">*</span>
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
                className={`w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-4 ${
                  errores.ci
                    ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10"
                    : "border-slate-300 hover:border-slate-400 focus:border-indigo-500 focus:ring-indigo-500/10"
                }`}
              />
              {errores.ci && (
                <p
                  id="consulta-ci-error"
                  role="alert"
                  className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600"
                >
                  <AlertIcon className="mt-px size-3.5 shrink-0" />
                  {errores.ci}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
              <ShieldIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
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
            className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
          >
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            <p>{errores.general}</p>
          </div>
        )}

        {reporte && (
          <section
            aria-labelledby="resultado-ticket"
            className="animate-fade-in mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
          >
            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                  <DocumentIcon className="size-5" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    Ticket
                  </p>
                  <h2
                    id="resultado-ticket"
                    className="font-mono text-lg font-semibold tracking-wider text-slate-900"
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
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  NRC {reporte.nrc}
                </span>
              </Dato>
              <Dato etiqueta="Aula">
                {reporte.materiaAula || "No registrada"}
              </Dato>
              <Dato etiqueta="Tipo de error">
                {getTipoErrorLabel(reporte.tipo_error)}
              </Dato>
              <Dato etiqueta="Fecha de registro">
                {formatoFecha.format(new Date(reporte.creadoEn))}
              </Dato>
              <Dato etiqueta="Reportado por">
                {reporte.nombre}
                <span className="mt-0.5 block text-xs font-normal text-slate-500">
                  CI {reporte.ci}
                </span>
              </Dato>
              <Dato etiqueta="Correo">
                <span className="break-all">{reporte.correo}</span>
              </Dato>
            </dl>

            <div className="border-t border-slate-100 px-5 py-4">
              <p className="text-xs font-medium text-slate-500">Motivo</p>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {reporte.motivo}
              </p>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldIcon className="size-3.5" />
                Consulta validada con ticket y cédula.
              </p>
              <Link
                href="/reportar"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Reportar otro problema
                <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          </section>
        )}
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="flex size-9 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <MailIcon className="size-4" />
          </span>
          <h2 className="mt-3 text-sm font-semibold text-slate-900">
            ¿Dónde está mi ticket?
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Se muestra al enviar el reporte y se envía al correo registrado.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="flex size-9 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <ClockIcon className="size-4" />
          </span>
          <h2 className="mt-3 text-sm font-semibold text-slate-900">
            Estados del reporte
          </h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Pendiente de revisión → En revisión → Resuelto. El panel
            administrativo se integrará en una siguiente etapa.
          </p>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] leading-5 text-slate-400">
        La consulta se valida en el servidor: el ticket y la cédula deben
        coincidir.
      </p>
    </div>
  );
}
