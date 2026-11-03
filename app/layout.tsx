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

/**
 * Se ejecuta antes de pintar para aplicar el tema guardado (o el del sistema)
 * sin un destello del tema claro.
 */
const scriptTema = `(function(){try{var g=localStorage.getItem("tema");var o=g?g==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",o);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: scriptTema }} />
      </head>
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        <ReportesProvider>{children}</ReportesProvider>
      </body>
    </html>
  );
}
