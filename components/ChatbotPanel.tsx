"use client";

import { ArrowRightIcon, ChatIcon, SendIcon } from "./icons";

interface ChatbotPanelProps {
  onIrAFormulario: () => void;
}

const PASOS = [
  "Cuéntale al asistente qué materia y qué día tienes el problema.",
  "Confirma tus datos y el tipo de error detectado.",
  "Recibe tu código de ticket al finalizar la conversación.",
];

export function ChatbotPanel({ onIrAFormulario }: ChatbotPanelProps) {
  return (
    <section
      aria-labelledby="titulo-chatbot"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <ChatIcon className="size-5" />
          </span>
          <div>
            <h2
              id="titulo-chatbot"
              className="text-sm font-semibold text-slate-900"
            >
              Asistente de horarios
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span className="size-1.5 rounded-full bg-amber-400" />
              En preparación · versión beta
            </p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Próximamente
        </span>
      </div>

      <div className="bg-slate-50/70 px-5 py-10 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-md text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200">
            <ChatIcon className="size-7" />
          </span>

          <h3 className="mt-5 text-lg font-semibold tracking-tight text-slate-900">
            El chatbot estará disponible pronto
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Estamos afinando el asistente para que puedas reportar tu problema
            conversando, sin llenar formularios.
          </p>

          <ol className="mt-6 space-y-3 text-left">
            {PASOS.map((paso, indice) => (
              <li
                key={paso}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold text-indigo-700">
                  {indice + 1}
                </span>
                <span className="text-sm leading-6 text-slate-600">{paso}</span>
              </li>
            ))}
          </ol>

          <button
            type="button"
            onClick={onIrAFormulario}
            className="mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 active:bg-indigo-800"
          >
            Usar el formulario tradicional
            <ArrowRightIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white p-4 sm:px-6">
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <input
            type="text"
            disabled
            aria-label="Mensaje para el asistente (no disponible)"
            placeholder="Escribe tu mensaje..."
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-500 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            disabled
            aria-label="Enviar mensaje (no disponible)"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-200 text-slate-400"
          >
            <SendIcon className="size-4" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          El canal de chat todavía no recibe reportes.
        </p>
      </div>
    </section>
  );
}
