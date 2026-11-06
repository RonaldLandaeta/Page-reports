import "server-only";

import { CONFIG } from "@/lib/config";

import { obtenerSupabaseAdmin } from "./admin";

/** Base sin la migración 0010: el límite por cédula aún no puede aplicarse. */
function faltaColumnaCi(error: { code?: string } | null): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}

/**
 * Freno de fuerza bruta para /api/reportes/consultar. Se limita por IP y, si
 * se conoce, por cédula: rotar IPs no sirve para probar tickets contra una
 * misma cédula.
 */
export async function consultasBloqueadas(
  ipHash: string,
  ci?: string,
): Promise<boolean> {
  const desde = new Date(
    Date.now() - CONFIG.ventanaConsultasMinutos * 60 * 1000,
  ).toISOString();

  const { count: porIp, error: errorIp } = await obtenerSupabaseAdmin()
    .from("consulta_intentos")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("creado_en", desde);

  if (errorIp) throw new Error("No se pudo comprobar el límite de consultas.");

  if ((porIp ?? 0) >= CONFIG.maxConsultasFallidasPorIp) return true;

  if (!ci) return false;

  const { count: porCedula, error: errorCedula } =
    await obtenerSupabaseAdmin()
      .from("consulta_intentos")
      .select("id", { count: "exact", head: true })
      .eq("ci", ci)
      .gte("creado_en", desde);

  if (errorCedula) {
    if (faltaColumnaCi(errorCedula)) {
      console.warn(
        "[consultas] falta la migración 0010 (consulta_intentos.ci); se aplica solo el límite por IP.",
      );
      return false;
    }

    throw new Error("No se pudo comprobar el límite de consultas por cédula.");
  }

  return (porCedula ?? 0) >= CONFIG.maxConsultasFallidasPorCedula;
}

export async function registrarConsultaFallida(
  ipHash: string,
  ci?: string,
): Promise<void> {
  const supabase = obtenerSupabaseAdmin();
  const { error } = await supabase
    .from("consulta_intentos")
    .insert({ ip_hash: ipHash, ci: ci ?? null });

  if (!error) return;

  if (faltaColumnaCi(error)) {
    console.warn(
      "[consultas] falta la migración 0010 (consulta_intentos.ci); se registra el intento solo por IP.",
    );
    const { error: errorSinCi } = await supabase
      .from("consulta_intentos")
      .insert({ ip_hash: ipHash });

    if (errorSinCi) {
      console.error("[consultas] no se pudo registrar el intento.", errorSinCi);
    }
    return;
  }

  console.error("[consultas] no se pudo registrar el intento.", error);
}

export type MotivoIntentoAdmin =
  | "ok"
  | "credenciales"
  | "sin_permiso"
  | "bloqueado";

/**
 * Bloqueo de login de /admin por correo, además del bloqueo por IP. Así un
 * ataque distribuido (muchas IPs contra la misma cuenta) también se frena.
 * Los intentos ya bloqueados no cuentan: el bloqueo no se extiende solo.
 */
export async function intentosAdminPorCorreoBloqueados(
  correo: string,
): Promise<boolean> {
  const desde = new Date(
    Date.now() - CONFIG.ventanaIntentosAdminMinutos * 60 * 1000,
  ).toISOString();

  const { count, error } = await obtenerSupabaseAdmin()
    .from("admin_intentos")
    .select("id", { count: "exact", head: true })
    .eq("correo", correo)
    .eq("exito", false)
    .in("motivo", ["credenciales", "sin_permiso"])
    .gte("creado_en", desde);

  if (error) {
    throw new Error("No se pudo comprobar el límite de intentos por correo.");
  }

  return (count ?? 0) >= CONFIG.maxIntentosAdminPorCorreo;
}

/** Auditoría de login de /admin. Nunca interrumpe el inicio de sesión. */
export async function registrarIntentoAdmin(datos: {
  correo: string;
  ipHash: string;
  exito: boolean;
  motivo: MotivoIntentoAdmin;
}): Promise<void> {
  const { error } = await obtenerSupabaseAdmin()
    .from("admin_intentos")
    .insert({
      correo: datos.correo.slice(0, 254),
      ip_hash: datos.ipHash,
      exito: datos.exito,
      motivo: datos.motivo,
    });

  if (error) console.error("[admin/auditoria] no se pudo registrar.", error);
}
