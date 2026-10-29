import type { Metadata } from "next";

import { obtenerMaterias } from "@/lib/catalogo-materias";

import { ReportarView } from "./ReportarView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reportar un problema",
  description:
    "Reporta errores de horario, aula o docente y recibe un ticket de seguimiento.",
};

export default async function ReportarPage() {
  const materias = await obtenerMaterias();

  return <ReportarView materias={materias} />;
}
