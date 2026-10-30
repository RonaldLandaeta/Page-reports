import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";

import {
  claveAnonima,
  fetchConTimeout,
  obtenerSupabaseAdmin,
  urlSupabase,
} from "@/lib/supabase/admin";

export const COOKIE_ADMIN = "admin_token";

export interface AdminActual {
  userId: string;
  email: string;
}

export interface SesionAdmin {
  token: string;
  expiraEnSegundos: number;
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

/**
 * Autentica con Supabase Auth y solo devuelve una sesión si el usuario está
 * autorizado en public.administradores. Nunca crea cookies por sí misma.
 */
export async function autenticarAdmin(
  correo: string,
  clave: string,
): Promise<SesionAdmin | null> {
  const url = urlSupabase();
  const anon = claveAnonima();

  const clienteAuth = createClient(url, anon, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: fetchConTimeout,
    },
  });

  const { data, error } = await clienteAuth.auth.signInWithPassword({
    email: correo,
    password: clave,
  });

  if (error || !data.user || !data.session) return null;

  // La service_role se utiliza exclusivamente en el servidor para consultar
  // la lista de administradores protegida por RLS.
  const { data: administrador, error: errorAdmin } = await obtenerSupabaseAdmin()
    .from("administradores")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (errorAdmin) {
    throw new Error("No se pudieron comprobar los permisos de administrador.");
  }

  if (!administrador) return null;

  const expiraEnSegundos = data.session.expires_in;
  if (!Number.isFinite(expiraEnSegundos) || expiraEnSegundos <= 0) {
    throw new Error("Supabase devolvió una duración de sesión inválida.");
  }

  return {
    token: data.session.access_token,
    expiraEnSegundos,
  };
}

/** Guarda el JWT de Supabase en una cookie protegida y limitada a su vigencia. */
export function iniciarSesionAdmin(
  response: NextResponse,
  token: string,
  expiraEnSegundos: number,
): void {
  if (!token || !Number.isFinite(expiraEnSegundos) || expiraEnSegundos <= 0) {
    throw new Error("No se puede crear una cookie con una sesión inválida.");
  }

  response.cookies.set(COOKIE_ADMIN, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(expiraEnSegundos),
  });
}

/** Valida el JWT y vuelve a comprobar que el usuario siga siendo administrador. */
export async function obtenerAdmin(
  request: Request,
): Promise<AdminActual | null> {
  const token = leerCookie(request, COOKIE_ADMIN);
  if (!token) return null;

  const supabase = obtenerSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) return null;

  const { data: fila, error: errorAdmin } = await supabase
    .from("administradores")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (errorAdmin || !fila) return null;

  return { userId: data.user.id, email: data.user.email ?? "" };
}

/** Invalida la cookie en el navegador usando exactamente sus atributos de ruta. */
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
