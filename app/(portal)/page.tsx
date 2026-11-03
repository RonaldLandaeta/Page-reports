import Link from "next/link";

import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  DocumentIcon,
  MailIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/icons";
import { CONFIG } from "@/lib/config";

const CLASES_EJEMPLO = [
  {
    hora: "07:00",
    materia: "Álgebra y Trigonometría",
    nrc: "02002",
    color: "border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  },
  {
    hora: "09:00",
    materia: "Lógica",
    nrc: "02009",
    color: "border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  {
    hora: "14:00",
    materia: "Álgebra Lineal",
    nrc: "02101",
    color: "border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300",
  },
];

const PASOS = [
  {
    titulo: "Completa tus datos",
    descripcion:
      "Elige la materia de la malla, indica el tipo de error y verifica tu correo.",
  },
  {
    titulo: "Validamos el reporte",
    descripcion:
      "Se evitan duplicados y se aplica un límite diario para cuidar el proceso.",
  },
  {
    titulo: "Recibe tu ticket",
    descripcion:
      "Obtén un código único y consulta el estado con tu ticket y cédula.",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden rounded-3xl border border-indigo-100 dark:border-indigo-500/30 bg-white dark:bg-slate-900 px-6 py-10 shadow-sm sm:px-10 sm:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-indigo-100/80 dark:bg-indigo-500/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-40 size-64 rounded-full bg-sky-100/60 dark:bg-sky-500/10 blur-3xl"
        />

        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              <ClockIcon className="size-3.5" />
              Ciclo académico 2026-2
            </span>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl lg:text-5xl">
              Un horario sin errores,{" "}
              <span className="text-indigo-600 dark:text-indigo-400">con seguimiento.</span>
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-400 sm:text-base sm:leading-7">
              Reporta errores de prerrequisito, correquisito, reservas o cruces de horario. Recibirás un
              ticket único para consultar el avance de tu caso sin escribir
              correos sueltos.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/reportar"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 active:bg-indigo-800"
              >
                Reportar un problema
                <ArrowRightIcon className="size-4" />
              </Link>
              <Link
                href="/consultar"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15"
              >
                <SearchIcon className="size-4" />
                Consultar mi ticket
              </Link>
            </div>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
              <li className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-emerald-500 dark:text-emerald-400" />
                Verificación por correo
              </li>
              <li className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-emerald-500 dark:text-emerald-400" />
                Ticket único
              </li>
              <li className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-emerald-500 dark:text-emerald-400" />
                Consulta protegida
              </li>
            </ul>
          </div>

          <div className="relative hidden lg:block">
            <div
              aria-hidden="true"
              className="absolute -inset-4 rounded-3xl bg-indigo-100/50 dark:bg-indigo-500/10 blur-2xl"
            />
            <div className="relative ml-auto w-72 rotate-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400">
                    Mi horario
                  </p>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Miércoles
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  3 clases
                </span>
              </div>

              <div className="mt-3 space-y-2">
                {CLASES_EJEMPLO.map((clase) => (
                  <div
                    key={clase.materia}
                    className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${clase.color}`}
                  >
                    <span className="font-mono text-[11px] font-semibold">
                      {clase.hora}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">
                        {clase.materia}
                      </p>
                      <p className="text-[10px] opacity-75">NRC {clase.nrc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-2.5 py-2 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                <span className="size-1.5 rounded-full bg-amber-400" />
                Un horario por confirmar
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Link
          href="/reportar"
          className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 dark:hover:border-indigo-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
            <DocumentIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Reportar un problema
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Usa el formulario o el asistente para describir el error en tu
            horario y generar tu ticket.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            Abrir formulario
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          href="/consultar"
          className="group rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 dark:hover:border-indigo-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/15 text-sky-600 dark:text-sky-400">
            <SearchIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Consultar mi ticket
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">
            Revisa el estado de un reporte anterior con el código de ticket y
            tu cédula registrada.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
            Buscar reporte
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>

      <section className="mt-10" aria-labelledby="titulo-como-funciona">
        <div className="flex flex-col gap-1">
          <h2
            id="titulo-como-funciona"
            className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100"
          >
            ¿Cómo funciona?
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Un flujo corto, con reglas claras y un código para dar seguimiento.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PASOS.map((paso, indice) => (
            <div
              key={paso.titulo}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                {indice + 1}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {paso.titulo}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                {paso.descripcion}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 text-xs leading-5 text-slate-500 dark:text-slate-400 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2">
          <ShieldIcon className="mt-0.5 size-4 shrink-0 text-slate-400 dark:text-slate-400" />
          Los reportes se guardan en Supabase. La verificación de correo y los
          tickets se validan en el servidor.
        </p>
        <p className="flex shrink-0 items-center gap-2 text-slate-400 dark:text-slate-400">
          <MailIcon className="size-4" />
          Límite: {CONFIG.maxReportesPorDia} por día
        </p>
      </div>
    </div>
  );
}
