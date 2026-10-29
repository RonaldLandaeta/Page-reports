import { guardarNotificacion } from "@/lib/reportes/almacen";
import type { Notificacion, Reporte } from "@/lib/types";

/**
 * Simulación del envío de correos. Se registra en localStorage para poder
 * inspeccionarlo y se escribe en consola. Al integrar backend, reemplazar
 * por el proveedor real (Resend, SES, SMTP, etc.).
 */
export function enviarConfirmacion(reporte: Reporte): Notificacion {
  const notificacion: Notificacion = {
    id: `not_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    ticket: reporte.ticket,
    correo: reporte.correo,
    asunto: `Reporte ${reporte.ticket} recibido`,
    tipo: "confirmacion",
    enviadoEn: new Date().toISOString(),
  };

  guardarNotificacion(notificacion);
  console.info(
    `[demo] Correo simulado a ${reporte.correo} · ${notificacion.asunto}`,
  );

  return notificacion;
}
