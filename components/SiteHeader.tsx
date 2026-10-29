"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ClockIcon } from "./icons";

const ENLACES = [
  { href: "/", label: "Inicio" },
  { href: "/reportar", label: "Reportar" },
  { href: "/consultar", label: "Consultar" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <ClockIcon className="size-5" />
          </span>
          <span className="hidden sm:block">
            <span className="block text-sm font-semibold leading-tight text-slate-900">
              Horarios Académicos
            </span>
            <span className="block text-[11px] text-slate-500">
              Portal de reportes
            </span>
          </span>
        </Link>

        <nav
          aria-label="Navegación principal"
          className="flex items-center gap-0.5 rounded-xl bg-slate-100 p-1"
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
                    ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-900/5"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {enlace.label}
              </Link>
            );
          })}
        </nav>

        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 lg:inline-flex">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Prototipo local
        </span>
      </div>
    </header>
  );
}
