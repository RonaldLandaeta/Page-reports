export const CONFIG = {
  maxReportesPorDia: 5,
  ventanaDuplicadosHoras: 24,
  /** Minutos que vive un código de 6 dígitos. */
  duracionCodigoVerificacionMinutos: 10,
  /** Minutos que vive el token firmado que autoriza crear el reporte. */
  duracionTokenVerificacionMinutos: 20,
  /** Espera mínima entre solicitudes de código para un mismo correo. */
  segundosEntreSolicitudes: 60,
  /** Solicitudes de código por correo en una hora. */
  maxSolicitudesCodigoPorHora: 5,
  /** Solicitudes de código por IP en una hora. */
  maxSolicitudesCodigoPorIpHora: 20,
  /** Intentos permitidos para acertar un mismo código. */
  maxIntentosCodigo: 5,
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
} as const;
