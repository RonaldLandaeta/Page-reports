export type CodigoErrorCliente =
  | "validacion"
  | "verificacion"
  | "duplicado"
  | "limite"
  | "materia"
  | "no_encontrado"
  | "interno"
  | "red";

export class ErrorApi extends Error {
  readonly codigo: CodigoErrorCliente;
  readonly ticket?: string;
  readonly campos?: Record<string, string>;

  constructor(
    codigo: CodigoErrorCliente,
    mensaje: string,
    opciones: { ticket?: string; campos?: Record<string, string> } = {},
  ) {
    super(mensaje);
    this.name = "ErrorApi";
    this.codigo = codigo;
    this.ticket = opciones.ticket;
    this.campos = opciones.campos;
  }
}

interface RespuestaError {
  ok: false;
  codigo?: string;
  mensaje?: string;
  ticket?: string;
  campos?: Record<string, string>;
}

/** POST JSON con el contrato `{ ok, ... }` de la API. */
export async function postJson<T>(
  url: string,
  cuerpo: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let respuesta: Response;

  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ErrorApi(
      "red",
      "No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.",
    );
  }

  let datos: unknown = null;

  try {
    datos = await respuesta.json();
  } catch {
    // Respuesta sin JSON (por ejemplo, un 502 de la plataforma).
  }

  if (!respuesta.ok || !esRespuestaOk(datos)) {
    const fallo = datos as RespuestaError | null;
    throw new ErrorApi(normalizarCodigo(fallo?.codigo), fallo?.mensaje ?? mensajePorEstado(respuesta.status), {
      ticket: typeof fallo?.ticket === "string" ? fallo.ticket : undefined,
      campos: fallo?.campos,
    });
  }

  return datos as T;
}

function esRespuestaOk(datos: unknown): datos is Record<string, unknown> & { ok: true } {
  return (
    typeof datos === "object" &&
    datos !== null &&
    (datos as { ok?: unknown }).ok === true
  );
}

function normalizarCodigo(codigo: string | undefined): CodigoErrorCliente {
  switch (codigo) {
    case "validacion":
    case "verificacion":
    case "duplicado":
    case "limite":
    case "materia":
    case "no_encontrado":
    case "interno":
      return codigo;
    default:
      return "interno";
  }
}

function mensajePorEstado(status: number): string {
  if (status === 429) return "Demasiadas solicitudes. Espera un momento.";
  if (status === 404) return "No encontramos lo que buscabas.";
  if (status >= 500) return "El servidor tuvo un problema. Intenta de nuevo.";
  return "No pudimos completar la solicitud.";
}
