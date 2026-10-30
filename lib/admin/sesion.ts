import "server-only";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";

export const COOKIE_ADMIN = "admin_session_token";

/** Duración por defecto de la cookie (1 h, igual que el JWT de Supabase). */
const DURACION_POR_DEFECTO_SEGUNDOS = 60 * 60;

export interface AdminActual {
  userId: string;
  email: string;
}

function leerCookie(request: Request, nombre: string): string | null {
  const cabecera = request.headers.get("cookie") ?? "";

  for (const parte of cabecera.split(";")) {
    const [clave, ...resto] = parte.trim().split("=");
    if (clave === nombre) return decodeURIComponent(resto.join("="));
  }

  return null;
}

/**
 * Valida el JWT de Supabase Auth de la cookie y comprueba que el usuario esté
 * en `administradores`. Devuelve null si no hay sesión válida.
 */
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

/**
 * Guarda el JWT en una cookie httpOnly. En Next.js 15 `cookies()` es asíncrono.
 */
export async function iniciarSesionAdmin(
  token: string,
  expiraEnSegundos: number = DURACION_POR_DEFECTO_SEGUNDOS,
): Promise<void> {
  const almacen = await cookies();

  almacen.set(COOKIE_ADMIN, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: expiraEnSegundos,
  });
}

/** Elimina la cookie de sesión de administración. */
export async function cerrarSesionAdmin(): Promise<void> {
  const almacen = await cookies();

  almacen.set(COOKIE_ADMIN, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

/** Inicio de sesión con la anon key (Supabase Auth); devuelve el JWT y su duración. */
export async function autenticarAdmin(
  correo: string,
  clave: string,
): Promise<{ token: string; expiraEnSegundos: number } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  const cliente = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await cliente.auth.signInWithPassword({
    email: correo,
    password: clave,
  });

  if (error || !data.session) return null;

  return {
    token: data.session.access_token,
    expiraEnSegundos: data.session.expires_in,
  };
}
