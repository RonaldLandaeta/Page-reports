"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ClockIcon } from "./icons";
import { ThemeToggle } from "./ThemeToggle";

const ENLACES = [
  { href: "/", label: "Inicio" },
  { href: "/reportar", label: "Reportar" },
  { href: "/consultar", label: "Consultar" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/85 dark:bg-slate-900/80 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <ClockIcon className="size-5" />
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
              Horarios Académicos
            </span>
            <span className="block text-[11px] text-slate-500 dark:text-slate-400">
              Portal de reportes
            </span>
          </span>
        </Link>

        <div className="flex items-center gap-2">
          <nav
            aria-label="Navegación principal"
            className="flex items-center gap-0.5 rounded-xl bg-slate-100 dark:bg-slate-800 p-1"
          >
            {ENLACES.map((enlace) => {
              const activo =
                enlace.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(enlace.href);

              return (
                <Link
                  key={enlace.href}
                  href={enlace.href}
                  aria-current={activo ? "page" : undefined}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:px-3 sm:text-sm ${
                    activo
                      ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-sm ring-1 ring-slate-900/5 dark:ring-white/10"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  {enlace.label}
                </Link>
              );
            })}
          </nav>

          <ThemeToggle />

          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 lg:inline-flex">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Prototipo local
          </span>
        </div>
      </div>
    </header>
  );
}
