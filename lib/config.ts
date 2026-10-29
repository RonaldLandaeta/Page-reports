export const CONFIG = {
  maxReportesPorDia: 5,
  ventanaDuplicadosHoras: 24,
  duracionCodigoVerificacionMinutos: 10,
  /**
   * Zona horaria que define el "día calendario" del límite diario.
   * Es fija para que el corte sea el mismo en el navegador y en el servidor
   * (Vercel corre en UTC).
   */
  zonaHoraria: "America/Guayaquil",
  /**
   * Muestra la consola JSON. Es un panel de desarrollo: expone cédula y
   * motivo en pantalla. Apágalo con NEXT_PUBLIC_MOSTRAR_CONSOLA=false.
   */
  mostrarConsola: process.env.NEXT_PUBLIC_MOSTRAR_CONSOLA !== "false",
  claves: {
    reportes: "reportes-horarios:reportes:v1",
    notificaciones: "reportes-horarios:notificaciones:v1",
  },
} as const;
