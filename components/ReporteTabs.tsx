"use client";

import { useRef, type ComponentType, type KeyboardEvent } from "react";

import { ChatIcon, DocumentIcon, type IconProps } from "./icons";

export type TabKey = "formulario" | "chatbot";

const TABS: Array<{
  id: TabKey;
  label: string;
  icon: ComponentType<IconProps>;
}> = [
  { id: "formulario", label: "Formulario", icon: DocumentIcon },
  { id: "chatbot", label: "Asistente", icon: ChatIcon },
];

interface ReporteTabsProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export function ReporteTabs({ active, onChange }: ReporteTabsProps) {
  const botonesRef = useRef<Array<HTMLButtonElement | null>>([]);

  /**
   * Patrón ARIA de pestañas: flechas mueven el foco y activan la pestaña,
   * Inicio/Fin saltan a los extremos. Solo la pestaña activa es tabulable.
   */
  function manejarTeclas(event: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let destino: number | null = null;

    if (event.key === "ArrowRight") {
      destino = (indice + 1) % TABS.length;
    } else if (event.key === "ArrowLeft") {
      destino = (indice - 1 + TABS.length) % TABS.length;
    } else if (event.key === "Home") {
      destino = 0;
    } else if (event.key === "End") {
      destino = TABS.length - 1;
    }

    if (destino === null) return;

    event.preventDefault();
    onChange(TABS[destino].id);
    botonesRef.current[destino]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Método para reportar el problema"
      className="grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-200/70 dark:bg-slate-800/70 p-1 sm:inline-flex sm:w-auto"
    >
      {TABS.map((tab, indice) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;

        return (
          <button
            key={tab.id}
            ref={(elemento) => {
              botonesRef.current[indice] = elemento;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => manejarTeclas(event, indice)}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950 ${
              isActive
                ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                : "text-slate-600 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100"
            }`}
          >
            <Icon className="size-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
