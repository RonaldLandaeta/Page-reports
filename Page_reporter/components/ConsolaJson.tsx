"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useReportes } from "@/context/ReportesContext";
import { CONFIG } from "@/lib/config";
import { aFilaReporte } from "@/lib/reportes/formato";

import { CheckIcon, CopyIcon } from "./icons";

/** Colorea claves y valores de texto. Todo se renderiza como texto de React. */
function resaltar(json: string): ReactNode[] {
  const token = /("(?:\\.|[^"\\])*")(\s*:)?/g;
  const nodos: ReactNode[] = [];
  let ultimo = 0;
  let coincidencia: RegExpExecArray | null;

  while ((coincidencia = token.exec(json)) !== null) {
    if (coincidencia.index > ultimo) {
      nodos.push(json.slice(ultimo, coincidencia.index));
    }

    nodos.push(
      <span
        key={coincidencia.index}
        className={coincidencia[2] ? "text-sky-300" : "text-emerald-300"}
      >
        {coincidencia[1]}
      </span>,
    );

    if (coincidencia[2]) nodos.push(coincidencia[2]);
    ultimo = token.lastIndex;
  }

  if (ultimo < json.length) nodos.push(json.slice(ultimo));
  return nodos;
}

export function ConsolaJson() {
  const { reportes, hidratado } = useReportes();
  // En móvil arranca plegada; en escritorio siempre se ve (ver clases).
  const [abierta, setAbierta] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  const json = useMemo(
    () => JSON.stringify(reportes.map(aFilaReporte), null, 2),
    [reportes],
  );
  const coloreado = useMemo(() => resaltar(json), [json]);

  if (!CONFIG.mostrarConsola) return null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(json);
      setCopiado(true);
      if (temporizador.current) clearTimeout(temporizador.current);
      temporizador.current = setTimeout(() => setCopiado(false), 1800);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section
      aria-labelledby="titulo-consola"
      className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-rose-400/80" />
            <span className="size-2.5 rounded-full bg-amber-400/80" />
            <span className="size-2.5 rounded-full bg-emerald-400/80" />
          </span>
          <h2
            id="titulo-consola"
            className="truncate font-mono text-xs font-medium text-slate-300"
          >
            reportes.json
            <span className="ml-2 text-slate-500">
              · {hidratado ? reportes.length : "…"}
            </span>
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={copiar}
            disabled={!hidratado || reportes.length === 0}
            aria-label="Copiar JSON"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[11px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copiado ? (
              <CheckIcon className="size-3.5 text-emerald-400" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
            {copiado ? "copiado" : "copiar"}
          </button>
          <button
            type="button"
            onClick={() => setAbierta((valor) => !valor)}
            aria-expanded={abierta}
            aria-controls="cuerpo-consola"
            className="rounded-md px-2 py-1 font-mono text-[11px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 lg:hidden"
          >
            {abierta ? "ocultar" : "mostrar"}
          </button>
        </div>
      </div>

      <div
        id="cuerpo-consola"
        className={abierta ? "block" : "hidden lg:block"}
      >
        <pre
          tabIndex={0}
          role="region"
          aria-label="Reportes en formato JSON"
          className="max-h-80 overflow-auto px-4 py-3 font-mono text-xs leading-5 text-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-400"
        >
          <span className="select-none text-slate-500">$ cat reportes.json{"\n"}</span>
          {hidratado ? coloreado : <span className="text-slate-500">…</span>}
        </pre>
        <p className="border-t border-slate-800 px-4 py-2 font-mono text-[11px] leading-5 text-slate-500">
          {"// POST /api/reportes → Supabase"}
        </p>
      </div>
    </section>
  );
}
