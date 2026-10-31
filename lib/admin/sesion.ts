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

const HORAS_POR_DEFECTO = 8;
const HORAS_MIN = 1;
const HORAS_MAX = 72;

export interface AdminActual {
  userId: string;
  email: string;
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
 * Duración EXACTA de la sesión (no se renueva sola). Configurable con
 * ADMIN_SESION_HORAS; por defecto 8 h.
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

function crearToken(admin: AdminActual, expiraEn: number): string {
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

async function esAdministrador(userId: string): Promise<boolean> {
  const { data, error } = await obtenerSupabaseAdmin()
    .from("administradores")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("No se pudieron comprobar los permisos de administrador.");

  return data !== null;
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

  if (!(await esAdministrador(data.user.id))) {
    return { ok: false, motivo: "sin_permiso" };
  }

  return {
    ok: true,
    admin: { userId: data.user.id, email: data.user.email ?? correo },
  };
}

/** Crea la cookie de sesión con la duración exacta configurada. */
export function iniciarSesionAdmin(
  response: NextResponse,
  admin: AdminActual,
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
 * Valida la firma y la expiración y vuelve a comprobar en la base que el
 * usuario siga siendo administrador (si lo quitas, pierde el acceso al
 * instante aunque su cookie no haya vencido).
 */
export async function obtenerAdminPorToken(
  token: string,
): Promise<AdminActual | null> {
  const carga = leerToken(token);
  if (!carga) return null;

  try {
    if (!(await esAdministrador(carga.u))) return null;
  } catch (error) {
    console.error("[admin/sesion]", error);
    return null;
  }

  return { userId: carga.u, email: carga.e };
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
