import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/** Evita que una petición quede colgada si Supabase no responde. */
const TIMEOUT_MS = 8_000;

let cliente: SupabaseClient<Database> | null = null;

function variable(nombre: string): string {
  return (process.env[nombre] ?? "").trim();
}

/**
 * URL base del proyecto. Acepta `SUPABASE_URL` (servidor) o la variable
 * pública, y corrige los errores más comunes: espacios, barra final o una URL
 * pegada con `/rest/v1`.
 */
export function urlSupabase(): string {
  const valor = variable("SUPABASE_URL") || variable("NEXT_PUBLIC_SUPABASE_URL");

  if (!valor) {
    throw new Error(
      "Falta NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL) en el entorno.",
    );
  }

  let url: URL;

  try {
    url = new URL(valor);
  } catch {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL no es una URL válida. Debe verse como https://<ref>.supabase.co.",
    );
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL debe usar http o https.");
  }

  const ruta = url.pathname.replace(/\/+$/, "");

  if (ruta && ruta !== "/rest/v1") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL debe ser solo el origen (https://<ref>.supabase.co), sin ruta.",
    );
  }

  return url.origin;
}

/**
 * Variable de la que salió la URL. En Vercel es común tener un `SUPABASE_URL`
 * antiguo que tiene prioridad sobre la variable pública; saberlo evita buscar
 * el problema en el proyecto equivocado.
 */
export function fuenteUrlSupabase(): "SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_URL" | null {
  if (variable("SUPABASE_URL")) return "SUPABASE_URL";
  if (variable("NEXT_PUBLIC_SUPABASE_URL")) return "NEXT_PUBLIC_SUPABASE_URL";
  return null;
}

/**
 * Referencia del proyecto (`<ref>.supabase.co`). No es un secreto: aparece en
 * todas las peticiones del cliente. Sirve para comparar el proyecto local con
 * el de producción.
 */
export function proyectoSupabase(): string {
  try {
    return new URL(urlSupabase()).hostname;
  } catch {
    return "";
  }
}

export function claveAnonima(): string {
  const valor = variable("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!valor) {
    throw new Error("Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en el entorno.");
  }

  return valor;
}

/** Extrae el rol de una clave JWT clásica de Supabase, si lo tiene. */
function rolDeClave(clave: string): string | null {
  const partes = clave.split(".");
  if (partes.length !== 3) return null;

  try {
    const payload: unknown = JSON.parse(
      Buffer.from(partes[1], "base64url").toString("utf8"),
    );

    if (typeof payload !== "object" || payload === null) return null;

    const rol = (payload as { role?: unknown }).role;
    return typeof rol === "string" ? rol : null;
  } catch {
    return null;
  }
}

/**
 * Clave service_role. Se valida para no confundirla con la anon: con la anon,
 * las tablas sin política de lectura fallan con "permission denied".
 */
export function claveServiceRole(): string {
  const valor = variable("SUPABASE_SERVICE_ROLE_KEY");

  if (!valor) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  }

  const anon = variable("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (anon && valor === anon) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY contiene la clave anon. Usa la clave service_role (o sb_secret_…).",
    );
  }

  if (valor.startsWith("sb_publishable_")) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY contiene una clave publicable. Usa la clave secreta (service_role / sb_secret_…).",
    );
  }

  const rol = rolDeClave(valor);

  if (rol && rol !== "service_role") {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY tiene rol "${rol}", no "service_role". Revisa la clave en Vercel.`,
    );
  }

  return valor;
}

export function haySupabaseConfigurado(): boolean {
  try {
    urlSupabase();
    claveServiceRole();
    return true;
  } catch {
    return false;
  }
}

/** `fetch` con timeout para todas las llamadas a Supabase. */
export const fetchConTimeout: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout;

  return fetch(input, { ...init, signal });
};

/** Permite limpiar la instancia de cliente en caché si es necesario reconfigurar la conexión. */
export function limpiarClienteAdmin(): void {
  cliente = null;
}

/**
 * Cliente con la service_role y tipado estricto con `Database`. 
 * Salta RLS, así que solo puede importarse desde código de servidor.
 */
export function obtenerSupabaseAdmin(): SupabaseClient<Database> {
  if (cliente) return cliente;

  cliente = createClient<Database>(urlSupabase(), claveServiceRole(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: { "x-application-name": "page-reporter" },
      fetch: fetchConTimeout,
    },
  });

  return cliente;
}