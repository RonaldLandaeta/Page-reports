export const CONFIG = {
  maxReportesPorDia: 10,
  ventanaDuplicadosHoras: 24,
  /** Minutos que vive el token firmado que autoriza crear el reporte. */
  duracionTokenVerificacionMinutos: 20,
  /** Minutos que vive el token previo al segundo factor de /admin. */
  duracionTokenPreAuthAdminMinutos: 10,
  /** TOTP: 6 dígitos cada 30 s, con un paso de tolerancia de reloj. */
  totpPeriodoSegundos: 30,
  totpDigitos: 6,
  totpVentanaPasos: 1,
  /**
   * Minutos de bloqueo que se muestran al usuario. La base aplica el bloqueo
   * (5 intentos fallidos) de forma atómica en `registrar_fallo_totp`; este
   * valor solo debe coincidir con el intervalo definido allí.
   */
  bloqueoTotpMinutos: 15,
  /** Horas que vive un código de enrolamiento entregado por un admin. */
  duracionCodigoEnrolamientoHoras: 24,
  /** Consultas fallidas (ticket + cédula) permitidas por IP en la ventana. */
  maxConsultasFallidasPorIp: 10,
  /**
   * Consultas fallidas permitidas para una misma cédula en la ventana. Evita
   * que muchas IP rotativas prueben tickets contra una cédula concreta.
   */
  maxConsultasFallidasPorCedula: 20,
  ventanaConsultasMinutos: 15,
  /** Intentos fallidos de login de /admin permitidos por correo. */
  maxIntentosAdminPorCorreo: 5,
  ventanaIntentosAdminMinutos: 15,
  /**
   * Zona horaria que define el "día calendario" del límite diario.
   * Es fija para que el corte sea el mismo en el navegador y en el servidor
   * (Vercel corre en UTC).
   */
  zonaHoraria: "America/Caracas",
  /**
   * Muestra la consola JSON. Es un panel de desarrollo: expone cédula y
   * motivo en pantalla, así que en producción SIEMPRE queda apagada. En
   * desarrollo se enciende por defecto; `NEXT_PUBLIC_MOSTRAR_CONSOLA=false`
   * la oculta.
   */
  mostrarConsola:
    process.env.NODE_ENV !== "production" &&
    process.env.NEXT_PUBLIC_MOSTRAR_CONSOLA !== "false",
} as const;
