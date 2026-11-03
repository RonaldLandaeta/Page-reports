"use client";

import { useEffect, useState } from "react";

import { MoonIcon, SunIcon } from "./icons";

const CLAVE_TEMA = "tema";

/**
 * Alterna entre tema claro y oscuro. La preferencia se guarda en
 * localStorage y se aplica con la clase `.dark` en <html>.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    setOscuro(document.documentElement.classList.contains("dark"));
  }, []);

  function alternar() {
    const nuevo = !oscuro;
    setOscuro(nuevo);
    document.documentElement.classList.toggle("dark", nuevo);

    try {
      localStorage.setItem(CLAVE_TEMA, nuevo ? "dark" : "light");
    } catch {
      // Si el navegador bloquea localStorage, el tema sigue funcionando.
    }
  }

  const etiqueta = oscuro
    ? "Cambiar a modo claro"
    : "Cambiar a modo oscuro";

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={etiqueta}
      aria-pressed={oscuro}
      title={etiqueta}
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 ${className}`}
    >
      {/* El icono se elige con CSS para que sea correcto antes de hidratar. */}
      <MoonIcon className="size-4 dark:hidden" />
      <SunIcon className="hidden size-4 dark:block" />
    </button>
  );
}
