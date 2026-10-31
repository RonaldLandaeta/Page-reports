import type { Metadata } from "next";
import { listarMaterias } from "@/lib/materias";
import { ReportarView } from "./ReportarView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reportar un problema",
  description: "Reporta errores de horario y recibe un ticket de seguimiento.",
};

export default function ReportarPage() {
  // La malla es local (repositorio): no se consulta Supabase para listarla.
  const materias = listarMaterias();
  const error =
    materias.length === 0
      ? "La malla curricular local (lib/materias) está vacía."
      : null;

  return <ReportarView materias={materias} errorCatalogo={error} />;
}
