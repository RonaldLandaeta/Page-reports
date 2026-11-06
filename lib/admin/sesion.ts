import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

import { secretoVerificacion } from "@/lib/secreto";
import {
  claveAnonima,
  fetchConTimeout,
  obtenerSupabaseAdmin,
  urlSupabase,
} from "@/lib/supabase/admin";

export const COOKIE_ADMIN = "admin_token";

/** Tope absoluto de la sesión: ninguna configuración puede superarlo. */
const HORAS_MAX = 2;
const HORAS_POR_DEFECTO = HORAS_MAX;
const HORAS_MIN = 0.25;

export type RolAdmin = "admin" | "super";

export interface AdminActual {
  userId: string;
  email: string;
  rol: RolAdmin;
}

export function esSuperAdmin(admin: Pick<AdminActual, "rol">): boolean {
  return admin.rol === "super";
}

export type ResultadoAutenticacion =
  | { ok: true; admin: AdminActual }
  | { ok: false; motivo: "credenciales" | "sin_permiso" };

interface CargaSesion {
  /** user_id del administrador. */
  u: string;
  /** correo (solo informativo; los permisos se comprueban en la base). */
  e: string;
  /** expiración en segundos desde epoch (UTC). */
  x: number;
}

/**
 * Duración EXACTA de la sesión (no se renueva sola): 2 h por defecto y como
 * máximo. ADMIN_SESION_HORAS solo puede acortarla (mínimo 15 min).
 */
export function duracionSesionSegundos(): number {
  const bruto = Number((process.env.ADMIN_SESION_HORAS ?? "").trim());
  const horas =
    Number.isFinite(bruto) && bruto > 0
      ? Math.min(Math.max(bruto, HORAS_MIN), HORAS_MAX)
      : HORAS_POR_DEFECTO;

  return Math.round(horas * 3600);
}

// ── Token de sesión firmado (HMAC-SHA256) ───────────────────────────────────

function clavePropia(): Buffer {
  // Clave derivada: el mismo secreto no se reutiliza tal cual en otros usos.
  return createHmac("sha256", secretoVerificacion())
    .update("admin-sesion-v1")
    .digest();
}

function firmar(datos: string): Buffer {
  return createHmac("sha256", clavePropia()).update(datos).digest();
}

function crearToken(
  admin: Pick<AdminActual, "userId" | "email">,
  expiraEn: number,
): string {
  const carga: CargaSesion = { u: admin.userId, e: admin.email, x: expiraEn };
  const cuerpo = Buffer.from(JSON.stringify(carga)).toString("base64url");

  return `v1.${cuerpo}.${firmar(`v1.${cuerpo}`).toString("base64url")}`;
}

function leerToken(token: string): CargaSesion | null {
  const partes = token.split(".");
  if (partes.length !== 3 || partes[0] !== "v1") return null;

  const [version, cuerpo, firma] = partes;

  const esperada = firmar(`${version}.${cuerpo}`);
  const recibida = Buffer.from(firma, "base64url");

  if (
    recibida.length !== esperada.length ||
    !timingSafeEqual(recibida, esperada)
  ) {
    return null;
  }

  try {
    const carga: unknown = JSON.parse(
      Buffer.from(cuerpo, "base64url").toString("utf8"),
    );

    if (typeof carga !== "object" || carga === null) return null;

    const { u, e, x } = carga as Partial<CargaSesion>;

    if (typeof u !== "string" || typeof e !== "string" || typeof x !== "number") {
      return null;
    }

    if (x <= Math.floor(Date.now() / 1000)) return null;

    return { u, e, x };
  } catch {
    return null;
  }
}

function leerCookie(request: Request, nombre: string): string | null {
  const cabecera = request.headers.get("cookie") ?? "";

  for (const parte of cabecera.split(";")) {
    const separador = parte.indexOf("=");
    if (separador < 0) continue;

    const clave = parte.slice(0, separador).trim();
    if (clave !== nombre) continue;

    try {
      return decodeURIComponent(parte.slice(separador + 1));
    } catch {
      return null;
    }
  }

  return null;
}

/** Rol vigente en la base de datos, o null si ya no es administrador. */
async function rolDeAdministrador(userId: string): Promise<RolAdmin | null> {
  const { data, error } = await obtenerSupabaseAdmin()
    .from("administradores")
    .select("rol")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("No se pudieron comprobar los permisos de administrador.");

  return data ? (data.rol === "super" ? "super" : "admin") : null;
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Comprueba correo y contraseña con Supabase Auth y que el usuario esté en
 * public.administradores. Nunca crea cookies por sí misma.
 */
export async function autenticarAdmin(
  correo: string,
  clave: string,
): Promise<ResultadoAutenticacion> {
  const clienteAuth = createClient(urlSupabase(), claveAnonima(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchConTimeout },
  });

  const { data, error } = await clienteAuth.auth.signInWithPassword({
    email: correo,
    password: clave,
  });

  if (error || !data.user) return { ok: false, motivo: "credenciales" };

  const rol = await rolDeAdministrador(data.user.id);
  if (!rol) return { ok: false, motivo: "sin_permiso" };

  return {
    ok: true,
    admin: { userId: data.user.id, email: data.user.email ?? correo, rol },
  };
}

/** Crea la cookie de sesión con la duración exacta configurada. */
export function iniciarSesionAdmin(
  response: NextResponse,
  admin: Pick<AdminActual, "userId" | "email">,
): void {
  const segundos = duracionSesionSegundos();
  const expiraEn = Math.floor(Date.now() / 1000) + segundos;

  response.cookies.set(COOKIE_ADMIN, crearToken(admin, expiraEn), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: segundos,
  });
}

/**
 * Valida la firma y la expiración y vuelve a leer en la base que el usuario
 * siga siendo administrador y con qué rol (si lo quitas o lo degradas, el
 * cambio rige al instante aunque su cookie no haya vencido).
 */
export async function obtenerAdminPorToken(
  token: string,
): Promise<AdminActual | null> {
  const carga = leerToken(token);
  if (!carga) return null;

  try {
    const rol = await rolDeAdministrador(carga.u);
    return rol ? { userId: carga.u, email: carga.e, rol } : null;
  } catch (error) {
    console.error("[admin/sesion]", error);
    return null;
  }
}

export async function obtenerAdmin(
  request: Request,
): Promise<AdminActual | null> {
  const token = leerCookie(request, COOKIE_ADMIN);
  return token ? obtenerAdminPorToken(token) : null;
}

/** Invalida la cookie en el navegador usando exactamente sus atributos. */
export function cerrarSesionAdmin(response: NextResponse): void {
  response.cookies.set(COOKIE_ADMIN, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
}
