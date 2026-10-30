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
    hora: "08:00",
    materia: "Cálculo Diferencial",
    aula: "B-204",
    color: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  {
    hora: "10:00",
    materia: "Base de Datos",
    aula: "A-310",
    color: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    hora: "14:00",
    materia: "Ingeniería de Software",
    aula: "C-401",
    color: "border-violet-200 bg-violet-50 text-violet-700",
  },
];

const PASOS = [
  {
    titulo: "Completa tus datos",
    descripcion:
      "Identifica la materia por NRC, describe el problema y verifica tu correo.",
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
      <section className="relative overflow-hidden rounded-3xl border border-indigo-100 bg-white px-6 py-10 shadow-sm sm:px-10 sm:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-indigo-100/80 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 right-40 size-64 rounded-full bg-sky-100/60 blur-3xl"
        />

        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              <ClockIcon className="size-3.5" />
              Ciclo académico 2026-2
            </span>

            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              Un horario sin errores,{" "}
              <span className="text-indigo-600">con seguimiento.</span>
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base sm:leading-7">
              Reporta inconsistencias de día, aula o docente. Recibirás un
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
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15"
              >
                <SearchIcon className="size-4" />
                Consultar mi ticket
              </Link>
            </div>

            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <li className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-emerald-500" />
                Verificación por correo
              </li>
              <li className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-emerald-500" />
                Ticket único
              </li>
              <li className="flex items-center gap-1.5">
                <CheckIcon className="size-3.5 text-emerald-500" />
                Consulta protegida
              </li>
            </ul>
          </div>

          <div className="relative hidden lg:block">
            <div
              aria-hidden="true"
              className="absolute -inset-4 rounded-3xl bg-indigo-100/50 blur-2xl"
            />
            <div className="relative ml-auto w-72 rotate-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Mi horario
                  </p>
                  <p className="text-sm font-semibold text-slate-900">
                    Miércoles
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
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
                      <p className="text-[10px] opacity-75">Aula {clase.aula}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] font-medium text-amber-700">
                <span className="size-1.5 rounded-full bg-amber-400" />
                Un aula por confirmar
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-8 grid gap-5 sm:grid-cols-2">
        <Link
          href="/reportar"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <DocumentIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
            Reportar un problema
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            Usa el formulario o el asistente para describir el error en tu
            horario y generar tu ticket.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
            Abrir formulario
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>

        <Link
          href="/consultar"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          <span className="flex size-11 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
            <SearchIcon className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold tracking-tight text-slate-900">
            Consultar mi ticket
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-slate-500">
            Revisa el estado de un reporte anterior con el código de ticket y
            tu cédula registrada.
          </p>
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600">
            Buscar reporte
            <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </Link>
      </div>

      <section className="mt-10" aria-labelledby="titulo-como-funciona">
        <div className="flex flex-col gap-1">
          <h2
            id="titulo-como-funciona"
            className="text-xl font-semibold tracking-tight text-slate-900"
          >
            ¿Cómo funciona?
          </h2>
          <p className="text-sm text-slate-500">
            Un flujo corto, con reglas claras y un código para dar seguimiento.
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {PASOS.map((paso, indice) => (
            <div
              key={paso.titulo}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                {indice + 1}
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900">
                {paso.titulo}
              </h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {paso.descripcion}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2">
          <ShieldIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
          Los reportes se guardan en Supabase. La verificación de correo y los
          tickets se validan en el servidor.
        </p>
        <p className="flex shrink-0 items-center gap-2 text-slate-400">
          <MailIcon className="size-4" />
          Límite: {CONFIG.maxReportesPorDia} por día
        </p>
      </div>
    </div>
  );
}
