import "server-only";

import { CONFIG } from "@/lib/config";

import { obtenerSupabaseAdmin } from "./admin";

/**
 * Freno de fuerza bruta para /api/reportes/consultar: el ticket tiene solo
 * 900 000 combinaciones, así que se limitan las consultas FALLIDAS por IP.
 */
export async function consultasBloqueadas(ipHash: string): Promise<boolean> {
  const desde = new Date(
    Date.now() - CONFIG.ventanaConsultasMinutos * 60 * 1000,
  ).toISOString();

  const { count, error } = await obtenerSupabaseAdmin()
    .from("consulta_intentos")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("creado_en", desde);

  if (error) throw new Error("No se pudo comprobar el límite de consultas.");

  return (count ?? 0) >= CONFIG.maxConsultasFallidasPorIp;
}

export async function registrarConsultaFallida(ipHash: string): Promise<void> {
  const { error } = await obtenerSupabaseAdmin()
    .from("consulta_intentos")
    .insert({ ip_hash: ipHash });

  if (error) console.error("[consultas] no se pudo registrar el intento.", error);
}

export type MotivoIntentoAdmin =
  | "ok"
  | "credenciales"
  | "sin_permiso"
  | "bloqueado";

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
