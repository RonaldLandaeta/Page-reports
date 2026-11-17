"use client";

import type { Reporte } from "@/lib/types";

import { AdminView } from "../AdminView";

// Ruta temporal de previsualización: datos falsos, sin tocar Supabase.
const REPORTES: Reporte[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    ticket: "TK-100001",
    ci: "12345678",
    nombre: "Ana Pérez",
    correo: "ana@universidad.edu.ve",
    nrc: "12345",
    materiaCodigo: "FING-02002",
    materiaNombre: "Cálculo II",
    tipo_error: "cruce-horario",
    tipoErrorDetalle: "",
    motivo: "Cálculo II y Física I se cruzan los martes a las 7:00.",
    estado: "resuelto",
    creadoEn: "2026-11-10T12:00:00.000Z",
    actualizadoEn: "2026-11-11T14:00:00.000Z",
    numeroLlegada: 1,
    eventos: [
      {
        id: 1,
        estadoAnterior: null,
        estadoNuevo: "pendiente",
        nota: "",
        adminEmail: null,
        creadoEn: "2026-11-10T12:00:00.000Z",
      },
      {
        id: 2,
        estadoAnterior: "pendiente",
        estadoNuevo: "en-revision",
        nota: "Estamos revisando el cruce con la coordinación.",
        adminEmail: "soporte@mctr.dev",
        creadoEn: "2026-11-10T16:30:00.000Z",
      },
      {
        id: 3,
        estadoAnterior: "en-revision",
        estadoNuevo: "resuelto",
        nota: "Se movió Física I al turno de 9:00. Ya no hay cruce.",
        adminEmail: "soporte@mctr.dev",
        creadoEn: "2026-11-11T14:00:00.000Z",
      },
    ],
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    ticket: "TK-100002",
    ci: "12345678",
    nombre: "Ana Pérez",
    correo: "ana@universidad.edu.ve",
    nrc: "54321",
    materiaCodigo: "FING-03001",
    materiaNombre: "Programación I",
    tipo_error: "error-prerrequisito",
    tipoErrorDetalle: "",
    motivo: "La materia aparece sin el prerrequisito de Matemática I.",
    estado: "pendiente",
    creadoEn: "2026-11-12T09:15:00.000Z",
    actualizadoEn: "2026-11-12T09:15:00.000Z",
    numeroLlegada: 1,
    eventos: [
      {
        id: 4,
        estadoAnterior: null,
        estadoNuevo: "pendiente",
        nota: "",
        adminEmail: null,
        creadoEn: "2026-11-12T09:15:00.000Z",
      },
    ],
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    ticket: "TK-100003",
    ci: "87654321",
    nombre: "Luis Gómez",
    correo: "luis@universidad.edu.ve",
    nrc: "98765",
    materiaCodigo: "FING-04010",
    materiaNombre: "Estadística",
    tipo_error: "reserva-cerrada",
    tipoErrorDetalle: "",
    motivo: "La reserva cerró antes de la hora indicada en la malla.",
    estado: "en-revision",
    creadoEn: "2026-11-13T11:40:00.000Z",
    actualizadoEn: "2026-11-13T12:05:00.000Z",
    numeroLlegada: 2,
    eventos: [
      {
        id: 5,
        estadoAnterior: null,
        estadoNuevo: "pendiente",
        nota: "",
        adminEmail: null,
        creadoEn: "2026-11-13T11:40:00.000Z",
      },
      {
        id: 6,
        estadoAnterior: "pendiente",
        estadoNuevo: "en-revision",
        nota: "Pedimos el listado de reservas a la escuela.",
        adminEmail: "soporte@mctr.dev",
        creadoEn: "2026-11-13T12:05:00.000Z",
      },
    ],
  },
];

if (typeof window !== "undefined") {
  if (new URLSearchParams(window.location.search).get("tema") === "oscuro") {
    document.documentElement.classList.add("dark");
  }

  const original = window.fetch.bind(window);

  window.fetch = async (entrada, opciones) => {
    const url =
      typeof entrada === "string"
        ? entrada
        : entrada instanceof URL
          ? entrada.toString()
          : entrada.url;

    if (url.includes("/api/admin/reportes")) {
      const cuerpo = JSON.stringify({ ok: true, reportes: REPORTES, total: 3 });
      return new Response(cuerpo, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.includes("/api/admin/administradores")) {
      return new Response(JSON.stringify({ ok: true, administradores: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return original(entrada, opciones);
  };
}

export default function PreviewPage() {
  return (
    <>
      {/* Temporal: retrasa el load hasta que la data falsa ya se pintó. */}
      <img src="/api/preview-lento" alt="" className="hidden" />
      <AdminView miUserId="mock" esSuper={false} />
    </>
  );
}
