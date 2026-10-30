"use client";

import Link from "next/link";
import { useState } from "react";

import { ChatbotPanel } from "@/components/ChatbotPanel";
import { ConsolaJson } from "@/components/ConsolaJson";
import { FormularioTradicional } from "@/components/FormularioTradicional";
import { ReporteTabs, type TabKey } from "@/components/ReporteTabs";
import { ResumenReportes } from "@/components/ResumenReportes";
import { ArrowRightIcon, ClockIcon } from "@/components/icons";
import { CONFIG } from "@/lib/config";
import type { Materia } from "@/lib/types";

export function ReportarView({
  materias,
  errorCatalogo,
}: {
  materias: Materia[];
  errorCatalogo: string | null;
}) {
  const [tabActiva, setTabActiva] = useState<TabKey>("formulario");

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <ClockIcon className="size-3.5" />
            Ciclo académico 2026-2
          </span>
          <h1 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Reporta un problema en tu horario
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Indica la materia y qué está mal. Te entregaremos un ticket único
            para consultar el estado.
          </p>
        </div>

        <Link
          href="/consultar"
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15 sm:self-auto"
        >
          Consultar un ticket
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>

      <ReporteTabs active={tabActiva} onChange={setTabActiva} />

      <div
        className={`mt-5 grid gap-6 lg:items-start ${
          CONFIG.mostrarConsola ? "lg:grid-cols-[minmax(0,1fr)_20rem]" : ""
        }`}
      >
        <div className="min-w-0">
          <div
            role="tabpanel"
            id="panel-formulario"
            aria-labelledby="tab-formulario"
            hidden={tabActiva !== "formulario"}
          >
            <FormularioTradicional
              materias={materias}
              errorCatalogo={errorCatalogo}
            />
          </div>

          <div
            role="tabpanel"
            id="panel-chatbot"
            aria-labelledby="tab-chatbot"
            hidden={tabActiva !== "chatbot"}
          >
            <ChatbotPanel
              materias={materias}
              errorCatalogo={errorCatalogo}
              onIrAFormulario={() => setTabActiva("formulario")}
            />
          </div>
        </div>

        {CONFIG.mostrarConsola && (
          <div className="space-y-6">
            <ResumenReportes />
            <ConsolaJson />
          </div>
        )}
      </div>
    </div>
  );
}
