import type { Metadata } from "next";

import { ConsultarView } from "./ConsultarView";

export const metadata: Metadata = {
  title: "Consultar ticket",
  description:
    "Consulta el estado de un reporte de horario con tu ticket y cédula.",
};

export default function ConsultarPage() {
  return <ConsultarView />;
}
