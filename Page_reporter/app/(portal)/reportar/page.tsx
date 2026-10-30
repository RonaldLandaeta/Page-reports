import type { Metadata } from "next";

import { listarMaterias } from "@/lib/supabase/materias";

import { ReportarView } from "./ReportarView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reportar un problema",
  description:
    "Reporta errores de horario, aula o docente y recibe un ticket de seguimiento.",
};

export default async function ReportarPage() {
  const materias = await listarMaterias();

  return <ReportarView materias={materias} />;
}
