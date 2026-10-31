"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { useReportes, type ResultadoRegistro } from "@/context/ReportesContext";
import { ErrorApi, postJson } from "@/lib/api-cliente";
import {
  TIPOS_ERROR,
  getTipoErrorLabel,
  tipoRequiereDetalle,
} from "@/lib/catalogos";
import {
  filtrarMaterias,
  indexarMaterias,
  normalizarTexto,
  resolverMateria,
  type Materia,
  type MateriaIndexada,
} from "@/lib/materias/buscar";
import type { NuevoReporteInput, TipoError } from "@/lib/types";
import {
  CEDULA_MAX_DIGITOS,
  CEDULA_MIN_DIGITOS,
  DETALLE_ERROR_MAX,
  MOTIVO_MAX,
  MOTIVO_MIN,
  esCedulaValida,
  esCorreoInstitucional,
  esCorreoValido,
  mensajeCorreoInstitucional,
} from "@/lib/validaciones";

import { ArrowRightIcon, ChatIcon, SendIcon } from "./icons";

/* ───────────────────────────── Tipos y constantes ───────────────────────── */

type Paso =
  | "ci"
  | "nombre"
  | "correo"
  | "verificacion"
  | "nrc"
  | "tipo_error"
  | "detalle"
  | "motivo";

/** El usuario puede pedir otro código estando en el paso de verificación. */
const COMANDO_REENVIAR = new Set([
  "reenviar",
  "reenviar codigo",
  "otro codigo",
  "nuevo codigo",
]);

interface Mensaje {
  id: number;
  autor: "bot" | "usuario";
  texto: string;
  ticket?: string;
}

type ContenidoBot = { texto: string; ticket?: string };

interface Datos {
  ci?: string;
  nombre?: string;
  correo?: string;
  verificacionToken?: string;
  materia?: Materia;
  tipo_error?: TipoError;
  /** Solo para "otro" (máx. 100 caracteres). */
  tipo_error_detalle?: string;
}

interface Respuesta {
  mensajes: ContenidoBot[];
  paso: Paso;
  /** Opciones para desambiguar la materia (NRC repetido entre carreras). */
  opciones?: Materia[];
  /** Descarta los datos acumulados (reporte terminado o bloqueado). */
  reiniciar?: boolean;
}

interface ContextoProceso {
  datos: Datos;
  indice: MateriaIndexada[];
  registrar: (data: NuevoReporteInput) => Promise<ResultadoRegistro>;
}

const RETRASO_BOT_MS = 450;
const MOTIVO_MINIMO = MOTIVO_MIN;
const MOTIVO_MAXIMO = MOTIVO_MAX;

const PREGUNTAS: Record<Paso, string> = {
  ci: `¿Cuál es tu cédula? (${CEDULA_MIN_DIGITOS} a ${CEDULA_MAX_DIGITOS} dígitos)`,
  nombre: "Gracias. ¿Cuál es tu nombre completo?",
  correo: "¿A qué correo te enviamos la confirmación?",
  verificacion:
    "Escribe el código de 6 dígitos que enviamos a tu correo. Si no lo tienes, pulsa «Reenviar código».",
  nrc: "¿En qué materia está el problema? Escribe el NRC, el código o el nombre, o elige una de la lista.",
  tipo_error: "¿Qué tipo de problema es?",
  detalle: `Especifica el error (máximo ${DETALLE_ERROR_MAX} caracteres).`,
  motivo: `Cuéntame el motivo: ¿qué está mal en el horario? (mínimo ${MOTIVO_MINIMO} caracteres)`,
};

const PLACEHOLDERS: Record<Paso, string> = {
  ci: "Ej. 12345678",
  nombre: "Ej. Ana Martínez",
  correo: "nombre@correo-institucional.edu.ve",
  verificacion: "Código de 6 dígitos",
  nrc: "NRC, código o nombre de la materia",
  tipo_error: "Elige una opción o escríbela",
  detalle: "Ej. La materia no aparece en mi reserva",
  motivo: "Describe el problema…",
};

const ETIQUETAS: Record<Paso, string> = {
  ci: "cédula",
  nombre: "nombre",
  correo: "correo",
  verificacion: "código de verificación",
  nrc: "materia",
  tipo_error: "tipo de problema",
  detalle: "especifica el error",
  motivo: "motivo",
};

const MAX_LONGITUD: Record<Paso, number> = {
  ci: CEDULA_MAX_DIGITOS,
  nombre: 100,
  correo: 254,
  verificacion: 6,
  nrc: 80,
  tipo_error: 40,
  detalle: DETALLE_ERROR_MAX,
  motivo: MOTIVO_MAXIMO,
};

const REINICIO =
  "Si quieres reportar otro problema, escribe tu cédula para empezar de nuevo.";

const MENSAJES_INICIALES: Mensaje[] = [
  {
    id: 1,
    autor: "bot",
    texto:
      "¡Hola! Soy el asistente de horarios. Te ayudo a reportar un problema paso a paso y, al final, te entrego un ticket de seguimiento.",
  },
  { id: 2, autor: "bot", texto: PREGUNTAS.ci },
];

/* ──────────────────────────── Lógica de conversación ────────────────────── */

const TIPOS_NORMALIZADOS = TIPOS_ERROR.map((tipo) => ({
  value: tipo.value,
  etiqueta: normalizarTexto(tipo.label),
  clave: normalizarTexto(tipo.value),
}));

function resolverTipo(texto: string): TipoError | null {
  const consulta = normalizarTexto(texto);
  if (!consulta) return null;

  const exacto = TIPOS_NORMALIZADOS.find(
    (tipo) => tipo.etiqueta === consulta || tipo.clave === consulta,
  );
  if (exacto) return exacto.value;

  const parciales = TIPOS_NORMALIZADOS.filter((tipo) =>
    tipo.etiqueta.includes(consulta),
  );
  return parciales.length === 1 ? parciales[0].value : null;
}

function rechazo(paso: Paso, texto: string): Respuesta {
  return { mensajes: [{ texto }], paso };
}

function avanzar(paso: Paso, antes: ContenidoBot[] = []): Respuesta {
  return { mensajes: [...antes, { texto: PREGUNTAS[paso] }], paso };
}

function bloqueo(texto: string): Respuesta {
  return {
    mensajes: [{ texto }, { texto: REINICIO }],
    paso: "ci",
    reiniciar: true,
  };
}

/** Procesa la respuesta del usuario al paso actual. Muta `contexto.datos`. */
async function procesar(
  paso: Paso,
  texto: string,
  contexto: ContextoProceso,
): Promise<Respuesta> {
  const { datos, indice, registrar } = contexto;

  switch (paso) {
    case "ci": {
      if (!esCedulaValida(texto)) {
        return rechazo(
          "ci",
          `Esa cédula no es válida: debe tener entre ${CEDULA_MIN_DIGITOS} y ${CEDULA_MAX_DIGITOS} dígitos.`,
        );
      }

      datos.ci = texto.trim();
      return avanzar("nombre");
    }

    case "nombre": {
      const nombre = texto.replace(/\s+/g, " ").trim();
      if (nombre.length < 3) {
        return rechazo("nombre", "Escribe tu nombre completo (mínimo 3 letras).");
      }

      datos.nombre = nombre;
      return avanzar("correo");
    }

    case "correo": {
      const correo = texto.trim().toLowerCase();
      if (!esCorreoValido(correo)) {
        return rechazo(
          "correo",
          "Ese correo no parece válido. Revisa que tenga el formato nombre@dominio.com.",
        );
      }

      if (!esCorreoInstitucional(correo)) {
        return rechazo("correo", mensajeCorreoInstitucional());
      }

      try {
        const resultado = await postJson<{ codigoDemo?: string }>(
          "/api/verificacion/solicitar",
          { correo },
        );

        datos.correo = correo;
        datos.verificacionToken = undefined;

        const mensajes: ContenidoBot[] = [
          { texto: `Te enviamos un código de 6 dígitos a ${correo}.` },
        ];

        if (resultado.codigoDemo) {
          mensajes.push({
            texto: `Entorno de desarrollo: usa el código ${resultado.codigoDemo}.`,
          });
        }

        return avanzar("verificacion", mensajes);
      } catch (error) {
        return rechazo(
          "correo",
          error instanceof ErrorApi
            ? error.message
            : "No pudimos enviar el código de verificación. Intenta de nuevo.",
        );
      }
    }

    case "verificacion": {
      const { correo } = datos;

      if (!correo) {
        return bloqueo(
          "Perdí los datos de la verificación. Empecemos de nuevo.",
        );
      }

      if (COMANDO_REENVIAR.has(normalizarTexto(texto))) {
        try {
          const resultado = await postJson<{ codigoDemo?: string }>(
            "/api/verificacion/solicitar",
            { correo },
          );

          const mensajes: ContenidoBot[] = [
            { texto: `Te enviamos un nuevo código a ${correo}.` },
          ];

          if (resultado.codigoDemo) {
            mensajes.push({
              texto: `Entorno de desarrollo: usa el código ${resultado.codigoDemo}.`,
            });
          }

          return {
            mensajes: [...mensajes, { texto: PREGUNTAS.verificacion }],
            paso: "verificacion",
          };
        } catch (error) {
          return rechazo(
            "verificacion",
            error instanceof ErrorApi
              ? error.message
              : "No pudimos reenviar el código. Intenta de nuevo.",
          );
        }
      }

      if (!/^\d{6}$/.test(texto.trim())) {
        return rechazo(
          "verificacion",
          "El código debe tener exactamente 6 dígitos. Escríbelo o pulsa «Reenviar código».",
        );
      }

      try {
        const { token } = await postJson<{ token: string }>(
          "/api/verificacion/validar",
          { correo, codigo: texto.trim(), ci: datos.ci },
        );

        datos.verificacionToken = token;
        return avanzar("nrc", [{ texto: "Correo verificado correctamente." }]);
      } catch (error) {
        return rechazo(
          "verificacion",
          error instanceof ErrorApi
            ? error.message
            : "No pudimos validar el código. Intenta de nuevo.",
        );
      }
    }

    case "nrc": {
      // Por código, NRC o nombre. Un NRC repetido (02002 → FING y TELE) nunca
      // se resuelve solo: se muestran las opciones para que la persona elija.
      const resolucion = resolverMateria(indice, texto);

      if (resolucion.tipo === "ninguna") {
        return rechazo(
          "nrc",
          "No encontré ninguna materia con ese dato. Revisa el NRC, el código o el nombre, o elige una de las sugerencias.",
        );
      }

      if (resolucion.tipo === "ambigua") {
        const lista = resolucion.opciones
          .map((m) => `• ${m.codigo} — [${m.nrc}] ${m.nombre}`)
          .join("\n");

        return {
          mensajes: [
            {
              texto: `Encontré varias materias con ese dato:\n${lista}\n\nToca una opción o escribe su código completo (ej. ${resolucion.opciones[0].codigo}).`,
            },
          ],
          paso: "nrc",
          opciones: resolucion.opciones,
        };
      }

      const { materia } = resolucion;
      datos.materia = materia;
      const detalle = materia.horario;

      return avanzar("tipo_error", [
        {
          texto: `Perfecto: ${materia.nombre} (NRC ${materia.nrc}, ${materia.codigo})${detalle ? `, ${detalle}` : ""}.`,
        },
      ]);
    }

    case "tipo_error": {
      const tipo = resolverTipo(texto);
      if (!tipo) {
        return rechazo("tipo_error", "Elige uno de los tipos de problema de la lista.");
      }

      datos.tipo_error = tipo;
      datos.tipo_error_detalle = "";

      // "Otros" exige un detalle corto antes del motivo.
      return avanzar(tipoRequiereDetalle(tipo) ? "detalle" : "motivo");
    }

    case "detalle": {
      const detalle = texto.replace(/\s+/g, " ").trim();

      if (detalle.length === 0) {
        return rechazo("detalle", "Necesito que especifiques el error.");
      }

      if (detalle.length > DETALLE_ERROR_MAX) {
        return rechazo(
          "detalle",
          `Es muy largo: máximo ${DETALLE_ERROR_MAX} caracteres (escribiste ${detalle.length}).`,
        );
      }

      datos.tipo_error_detalle = detalle;
      return avanzar("motivo");
    }

    case "motivo": {
      const motivo = texto.trim();
      if (motivo.length < MOTIVO_MINIMO) {
        return rechazo(
          "motivo",
          `Cuéntame un poco más: describe el problema con al menos ${MOTIVO_MINIMO} caracteres.`,
        );
      }

      const {
        ci,
        nombre,
        correo,
        materia,
        tipo_error,
        tipo_error_detalle,
        verificacionToken,
      } = datos;
      if (
        !ci ||
        !nombre ||
        !correo ||
        !materia ||
        !tipo_error ||
        (tipoRequiereDetalle(tipo_error) && !tipo_error_detalle) ||
        !verificacionToken
      ) {
        return bloqueo("Perdí algunos datos de la conversación. Empecemos de nuevo.");
      }

      try {
        const resultado = await registrar({
          ci,
          nombre,
          correo,
          materia_codigo: materia.codigo,
          tipo_error,
          tipo_error_detalle: tipoRequiereDetalle(tipo_error)
            ? (tipo_error_detalle ?? "")
            : "",
          motivo,
          verificacionToken,
        });

        if (!resultado.ok) {
          return bloqueo(
            resultado.ticket
              ? `${resultado.mensaje} Tu ticket anterior es ${resultado.ticket}.`
              : resultado.mensaje,
          );
        }

        return {
          mensajes: [
            {
              texto: `¡Listo! Registré tu reporte («${getTipoErrorLabel(tipo_error)}») para ${materia.nombre}. Este es tu código de ticket:`,
              ticket: resultado.reporte.ticket,
            },
            {
              texto: `Guárdalo para consultar el estado en «Consultar un ticket». Te enviamos una confirmación a ${correo}.`,
            },
            { texto: REINICIO },
          ],
          paso: "ci",
          reiniciar: true,
        };
      } catch {
        return rechazo(
          "motivo",
          "No pude registrar el reporte. Envía el motivo otra vez para reintentarlo.",
        );
      }
    }
  }
}

/* ───────────────────────────── Componentes de UI ────────────────────────── */

const MensajeBurbuja = memo(function MensajeBurbuja({
  mensaje,
}: {
  mensaje: Mensaje;
}) {
  const esBot = mensaje.autor === "bot";

  return (
    <div className={`flex ${esBot ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 shadow-sm ${
          esBot
            ? "rounded-tl-sm border border-slate-200 bg-white text-slate-700"
            : "rounded-tr-sm bg-indigo-600 text-white"
        }`}
      >
        <span className="sr-only">{esBot ? "Asistente: " : "Tú: "}</span>
        <p className="whitespace-pre-wrap break-words">{mensaje.texto}</p>
        {mensaje.ticket && (
          <p className="mt-2 select-all rounded-lg bg-indigo-50 px-3 py-2 text-center font-mono text-base font-bold tracking-wider text-indigo-700 ring-1 ring-indigo-100">
            {mensaje.ticket}
          </p>
        )}
      </div>
    </div>
  );
});

function IndicadorEscribiendo() {
  return (
    <div className="flex justify-start" aria-hidden="true">
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {[0, 1, 2].map((punto) => (
          <span
            key={punto}
            className="size-1.5 animate-bounce rounded-full bg-slate-400 motion-reduce:animate-none"
            style={{ animationDelay: `${punto * 120}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

const CLASE_CHIP =
  "rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";

interface CompositorProps {
  paso: Paso;
  ocupado: boolean;
  deshabilitado: boolean;
  indice: MateriaIndexada[];
  /** Opciones pendientes de desambiguar (NRC repetido). */
  opciones: Materia[];
  entradaRef: RefObject<HTMLTextAreaElement | null>;
  onEnviar: (texto: string, vista?: string) => void;
}

/**
 * Tiene su propio estado de texto: así cada pulsación de tecla no vuelve a
 * renderizar la lista de mensajes.
 */
function Compositor({
  paso,
  ocupado,
  deshabilitado,
  indice,
  opciones,
  entradaRef,
  onEnviar,
}: CompositorProps) {
  const [texto, setTexto] = useState("");
  const bloqueado = ocupado || deshabilitado;

  const sugerencias = useMemo(() => {
    if (paso !== "nrc") return [];
    // Sin texto se muestran las opciones de la desambiguación pendiente.
    if (!texto.trim()) return opciones.length > 0 ? opciones : [];
    return filtrarMaterias(indice, texto, 6);
  }, [paso, indice, opciones, texto]);

  function cambiar(valor: string) {
    const soloDigitos = paso === "ci" || paso === "verificacion";
    setTexto(
      soloDigitos
        ? valor.replace(/\D/g, "").slice(0, MAX_LONGITUD[paso])
        : valor,
    );
  }

  function enviar(valor: string = texto, vista?: string) {
    const limpio = valor.trim();
    if (bloqueado || !limpio) return;

    onEnviar(limpio, vista);
    setTexto("");
  }

  function manejarTecla(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (event.shiftKey && paso === "motivo") return; // salto de línea

    event.preventDefault();
    enviar();
  }

  return (
    <div className="border-t border-slate-100 bg-white">
      {paso === "tipo_error" && (
        <div
          role="group"
          aria-label="Tipos de problema"
          className="flex flex-wrap gap-2 px-4 pt-3 sm:px-6"
        >
          {TIPOS_ERROR.map((tipo) => (
            <button
              key={tipo.value}
              type="button"
              disabled={bloqueado}
              onClick={() => enviar(tipo.value, tipo.label)}
              className={CLASE_CHIP}
            >
              {tipo.label}
            </button>
          ))}
        </div>
      )}

      {paso === "verificacion" && (
        <div className="flex flex-wrap gap-2 px-4 pt-3 sm:px-6">
          <button
            type="button"
            disabled={bloqueado}
            onClick={() => enviar("reenviar", "Reenviar código")}
            className={CLASE_CHIP}
          >
            Reenviar código
          </button>
        </div>
      )}

      {sugerencias.length > 0 && (
        <div
          role="group"
          aria-label="Materias sugeridas"
          className="flex flex-wrap gap-2 px-4 pt-3 sm:px-6"
        >
          {sugerencias.map((materia) => (
            <button
              key={materia.codigo}
              type="button"
              disabled={bloqueado}
              onClick={() =>
                enviar(
                  materia.codigo,
                  `[${materia.nrc}] ${materia.nombre} (${materia.codigo})`,
                )
              }
              className={CLASE_CHIP}
            >
              [{materia.nrc}] {materia.nombre}
              <span className="ml-1.5 font-mono text-[10px] font-medium opacity-70">
                {materia.codigo}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="p-4 sm:px-6">
        <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 transition-colors focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10">
          <textarea
            ref={entradaRef}
            rows={paso === "motivo" ? 3 : 1}
            value={texto}
            maxLength={MAX_LONGITUD[paso]}
            readOnly={ocupado}
            disabled={deshabilitado}
            inputMode={
              paso === "ci" || paso === "verificacion"
                ? "numeric"
                : paso === "correo"
                  ? "email"
                  : "text"
            }
            enterKeyHint="send"
            autoComplete="off"
            aria-label={`Tu respuesta: ${ETIQUETAS[paso]}`}
            placeholder={PLACEHOLDERS[paso]}
            onChange={(event) => cambiar(event.target.value)}
            onKeyDown={manejarTecla}
            className="max-h-32 min-w-0 flex-1 resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => enviar()}
            disabled={bloqueado || texto.trim().length === 0}
            aria-label="Enviar mensaje"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            <SendIcon className="size-4" />
          </button>
        </div>

        <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-slate-400">
          <span>
            {paso === "motivo"
              ? "Enter envía · Shift+Enter nueva línea"
              : "Enter para enviar"}
          </span>
          {paso === "motivo" && (
            <span className="tabular-nums">
              {texto.length}/{MOTIVO_MAXIMO}
            </span>
          )}
          {paso === "detalle" && (
            <span className="tabular-nums">
              {texto.length}/{DETALLE_ERROR_MAX}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────── Componente ─────────────────────────────── */

interface ChatbotPanelProps {
  materias: Materia[];
  errorCatalogo: string | null;
  onIrAFormulario: () => void;
}

export function ChatbotPanel({
  materias,
  errorCatalogo,
  onIrAFormulario,
}: ChatbotPanelProps) {
  const { registrarReporte } = useReportes();

  const [mensajes, setMensajes] = useState<Mensaje[]>(MENSAJES_INICIALES);
  const [paso, setPaso] = useState<Paso>("ci");
  const [ocupado, setOcupado] = useState(false);
  const [opciones, setOpciones] = useState<Materia[]>([]);

  // Estado que no se pinta vive en refs: evita renders y cierres obsoletos.
  const datosRef = useRef<Datos>({});
  const pasoRef = useRef<Paso>("ci");
  const ocupadoRef = useRef(false);
  const siguienteId = useRef(MENSAJES_INICIALES.length + 1);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactuado = useRef(false);
  const listaRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLTextAreaElement>(null);

  const indice = useMemo<MateriaIndexada[]>(
    () => indexarMaterias(materias),
    [materias],
  );

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  // Autoscroll dentro del contenedor (no mueve la página).
  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [mensajes, ocupado]);

  // Devuelve el foco al campo cuando el bot termina de responder.
  useEffect(() => {
    if (!ocupado && interactuado.current && paso !== "tipo_error") {
      entradaRef.current?.focus({ preventScroll: true });
    }
  }, [ocupado, paso]);

  const agregar = useCallback((items: Array<Omit<Mensaje, "id">>) => {
    // Los ids se asignan fuera del updater para que éste sea puro.
    const nuevos = items.map((item) => ({
      ...item,
      id: siguienteId.current++,
    }));
    setMensajes((previos) => [...previos, ...nuevos]);
  }, []);

  const enviar = useCallback(
    (entrada: string, vista?: string) => {
      const texto = entrada.trim();
      if (!texto || ocupadoRef.current) return;

      interactuado.current = true;
      ocupadoRef.current = true;
      setOcupado(true);

      const pasoActual = pasoRef.current;
      agregar([{ autor: "usuario", texto: vista ?? texto }]);

      temporizador.current = setTimeout(async () => {
        try {
          const respuesta = await procesar(pasoActual, texto, {
            datos: datosRef.current,
            indice,
            registrar: registrarReporte,
          });

          if (respuesta.reiniciar) datosRef.current = {};
          pasoRef.current = respuesta.paso;
          setPaso(respuesta.paso);
          setOpciones(respuesta.opciones ?? []);
          agregar(
            respuesta.mensajes.map((mensaje) => ({
              autor: "bot" as const,
              ...mensaje,
            })),
          );
        } catch {
          agregar([
            {
              autor: "bot",
              texto: "Ocurrió un error inesperado. Intenta de nuevo, por favor.",
            },
          ]);
        } finally {
          ocupadoRef.current = false;
          setOcupado(false);
        }
      }, RETRASO_BOT_MS);
    },
    [agregar, indice, registrarReporte],
  );

  const reiniciarConversacion = useCallback(() => {
    datosRef.current = {};
    pasoRef.current = "ci";
    interactuado.current = false;
    setPaso("ci");
    setOpciones([]);
    setMensajes(MENSAJES_INICIALES);
  }, []);

  const catalogoVacio = materias.length === 0;

  return (
    <section
      aria-labelledby="titulo-chatbot"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <ChatIcon className="size-5" />
          </span>
          <div>
            <h2
              id="titulo-chatbot"
              className="text-sm font-semibold text-slate-900"
            >
              Asistente de horarios
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              En línea · versión beta
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={reiniciarConversacion}
          disabled={ocupado}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Nueva conversación
        </button>
      </div>

      {catalogoVacio && (
        <p
          role="alert"
          className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-800 sm:px-6"
        >
          {errorCatalogo ??
            "El catálogo de materias está vacío, así que el asistente no puede registrar reportes ahora."}
        </p>
      )}

      <div
        ref={listaRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Conversación con el asistente"
        className="h-[26rem] space-y-3 overflow-y-auto bg-slate-50/70 px-4 py-5 sm:h-[30rem] sm:px-6"
      >
        {mensajes.map((mensaje) => (
          <MensajeBurbuja key={mensaje.id} mensaje={mensaje} />
        ))}
        {ocupado && <IndicadorEscribiendo />}
      </div>

      <Compositor
        paso={paso}
        ocupado={ocupado}
        deshabilitado={catalogoVacio}
        indice={indice}
        opciones={opciones}
        entradaRef={entradaRef}
        onEnviar={enviar}
      />

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-center sm:px-6">
        <button
          type="button"
          onClick={onIrAFormulario}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 transition-colors hover:text-indigo-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Prefiero usar el formulario tradicional
          <ArrowRightIcon className="size-3.5" />
        </button>
      </div>
    </section>
  );
}
