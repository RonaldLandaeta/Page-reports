import type { Metadata } from "next";

import { ReportesProvider } from "@/context/ReportesContext";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Horarios Académicos | Portal de reportes",
    template: "%s | Horarios Académicos",
  },
  description:
    "Reporta errores en tu horario de clases y consulta el estado con tu ticket.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <ReportesProvider>{children}</ReportesProvider>
      </body>
    </html>
  );
}
