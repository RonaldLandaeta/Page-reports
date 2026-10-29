"use client";

import type { ComponentType } from "react";

import { ChatIcon, DocumentIcon, type IconProps } from "./icons";

export type TabKey = "formulario" | "chatbot";

const TABS: Array<{
  id: TabKey;
  label: string;
  icon: ComponentType<IconProps>;
}> = [
  { id: "formulario", label: "Formulario Tradicional", icon: DocumentIcon },
  { id: "chatbot", label: "Chatbot", icon: ChatIcon },
];

interface ReporteTabsProps {
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

export function ReporteTabs({ active, onChange }: ReporteTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Método para reportar el problema"
      className="grid w-full grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 sm:inline-flex sm:w-auto"
    >
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
              isActive
                ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-900/5"
                : "text-slate-600 hover:bg-white/60 hover:text-slate-900"
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
