"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ErrorApi, postJson } from "@/lib/api-cliente";
import type { NuevoReporteInput, Reporte } from "@/lib/types";
import { normalizarTicket } from "@/lib/validaciones";

export type CodigoFallo =
  | "duplicado"
  | "limite"
  | "verificacion"
  | "materia"
  | "validacion"
  | "interno"
  | "red";

export type ResultadoRegistro =
  | { ok: true; reporte: Reporte }
  | { ok: false; codigo: CodigoFallo; mensaje: string; ticket?: string };

interface ReportesContextValue {
  /** Reportes creados en esta pestaña (solo para los paneles de desarrollo). */
  reportes: Reporte[];
  /** Indica que el cliente ya montó; evita parpadeos de hidratación. */
  hidratado: boolean;
  /** Envía el reporte a la API, que valida reglas, ticket y persistencia. */
  registrarReporte: (data: NuevoReporteInput) => Promise<ResultadoRegistro>;
  /** Consulta protegida por ticket + cédula. */
  buscarReporte: (ticket: string, ci: string) => Promise<Reporte | null>;
}

const ReportesContext = createContext<ReportesContextValue | null>(null);

export function ReportesProvider({ children }: { children: ReactNode }) {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    setHidratado(true);
  }, []);

  const registrarReporte = useCallback(
    async (data: NuevoReporteInput): Promise<ResultadoRegistro> => {
      try {
        const { reporte } = await postJson<{ reporte: Reporte }>(
          "/api/reportes",
          data,
        );

        setReportes((previos) => [reporte, ...previos]);
        return { ok: true, reporte };
      } catch (error) {
        if (error instanceof ErrorApi) {
          return {
            ok: false,
            codigo: error.codigo === "no_encontrado" ? "interno" : error.codigo,
            mensaje: error.message,
            ticket: error.ticket,
          };
        }

        throw error;
      }
    },
    [],
  );

  const buscarReporte = useCallback(
    async (ticket: string, ci: string): Promise<Reporte | null> => {
      try {
        const { reporte } = await postJson<{ reporte: Reporte }>(
          "/api/reportes/consultar",
          { ticket: normalizarTicket(ticket), ci: ci.trim() },
        );

        return reporte;
      } catch (error) {
        if (error instanceof ErrorApi && error.codigo === "no_encontrado") {
          return null;
        }

        throw error;
      }
    },
    [],
  );

  const value = useMemo(
    () => ({
      reportes,
      hidratado,
      registrarReporte,
      buscarReporte,
    }),
    [reportes, hidratado, registrarReporte, buscarReporte],
  );

  return (
    <ReportesContext.Provider value={value}>
      {children}
    </ReportesContext.Provider>
  );
}

export function useReportes(): ReportesContextValue {
  const context = useContext(ReportesContext);

  if (!context) {
    throw new Error("useReportes debe usarse dentro de <ReportesProvider>.");
  }

  return context;
}
