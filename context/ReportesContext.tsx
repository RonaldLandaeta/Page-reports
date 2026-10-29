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

import { CONFIG } from "@/lib/config";
import { enviarConfirmacion } from "@/lib/notificaciones";
import { guardarReportes, leerReportes } from "@/lib/reportes/almacen";
import {
  generarIdReporte,
  generarTicketUnico,
  validarReglas,
} from "@/lib/reportes/reglas";
import type { NuevoReporteInput, Reporte } from "@/lib/types";

export type ResultadoRegistro =
  | { ok: true; reporte: Reporte }
  | {
      ok: false;
      codigo: "duplicado" | "limite";
      mensaje: string;
      ticket?: string;
    };

interface ReportesContextValue {
  /** Reportes agregados, más recientes primero. */
  reportes: Reporte[];
  /** Indica si ya se leyó el almacenamiento local en el cliente. */
  hidratado: boolean;
  /** Valida reglas, genera el ticket, persiste y devuelve el reporte. */
  registrarReporte: (data: NuevoReporteInput) => Promise<ResultadoRegistro>;
  /** Busca un reporte por ticket + cédula (consulta protegida). */
  buscarReporte: (ticket: string, ci: string) => Reporte | null;
}

const ReportesContext = createContext<ReportesContextValue | null>(null);

export function ReportesProvider({ children }: { children: ReactNode }) {
  const [reportes, setReportes] = useState<Reporte[]>([]);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    setReportes(leerReportes());
    setHidratado(true);
  }, []);

  // Mantiene sincronizadas las pestañas abiertas del mismo navegador.
  useEffect(() => {
    function sincronizar(event: StorageEvent) {
      if (event.key === CONFIG.claves.reportes || event.key === null) {
        setReportes(leerReportes());
      }
    }

    window.addEventListener("storage", sincronizar);
    return () => window.removeEventListener("storage", sincronizar);
  }, []);

  const registrarReporte = useCallback(
    async (data: NuevoReporteInput): Promise<ResultadoRegistro> => {
      // Se lee el almacenamiento como fuente de verdad para evitar estados
      // obsoletos si hay varias pestañas o si aún no terminó la hidratación.
      const actuales = leerReportes();
      const validacion = validarReglas(actuales, data);

      if (!validacion.ok) {
        return validacion;
      }

      const reporte: Reporte = {
        ...data,
        id: generarIdReporte(),
        ticket: generarTicketUnico(actuales),
        creadoEn: new Date().toISOString(),
        estado: "pendiente",
      };

      const siguientes = [reporte, ...actuales];
      guardarReportes(siguientes);
      setReportes(siguientes);
      enviarConfirmacion(reporte);

      return { ok: true, reporte };
    },
    [],
  );

  const buscarReporte = useCallback(
    (ticket: string, ci: string): Reporte | null => {
      const ticketNormalizado = ticket.trim().toUpperCase();
      const ciNormalizada = ci.trim();

      return (
        leerReportes().find(
          (reporte) =>
            reporte.ticket.toUpperCase() === ticketNormalizado &&
            reporte.ci === ciNormalizada,
        ) ?? null
      );
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
