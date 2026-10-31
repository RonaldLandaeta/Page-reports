"use client";

import { useState, type FormEvent } from "react";

import { useReportes } from "@/context/ReportesContext";
import {
  TIPOS_ERROR,
  esTipoError,
  tipoRequiereDetalle,
} from "@/lib/catalogos";
import { CONFIG } from "@/lib/config";
import type { Materia } from "@/lib/materias";
import type { Reporte, TipoError } from "@/lib/types";
import {
  CEDULA_MAX_DIGITOS,
  CEDULA_MIN_DIGITOS,
  DETALLE_ERROR_MAX,
  MOTIVO_MAX,
  MOTIVO_MIN,
  NOMBRE_MIN,
  esCedulaValida,
  esCorreoInstitucional,
  esCorreoValido,
  mensajeCorreoInstitucional,
} from "@/lib/validaciones";

import { AlertIcon, ClockIcon, SendIcon, ShieldIcon } from "./icons";
import { ModalExito } from "./ModalExito";
import {
  VerificacionCorreo,
  type VerificacionAprobada,
} from "./VerificacionCorreo";

interface FormState {
  ci: string;
  nombre: string;
  correo: string;
  /** Código único de la malla (value del select). */
  materia_codigo: string;
  tipo_error: "" | TipoError;
  /** «Especifica el error»: solo visible y obligatorio para "otro". */
  tipo_error_detalle: string;
  motivo: string;
}

type CampoFormulario = keyof FormState;
type Errores = Partial<Record<CampoFormulario, string>>;

const FORMULARIO_INICIAL: FormState = {
  ci: "",
  nombre: "",
  correo: "",
  materia_codigo: "",
  tipo_error: "",
  tipo_error_detalle: "",
  motivo: "",
};

const ESTILO_CONTROL =
  "w-full rounded-xl border bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

function claseControl(invalido: boolean): string {
  return `${ESTILO_CONTROL} ${
    invalido
      ? "border-rose-400 focus:border-rose-500 focus:ring-rose-500/10"
      : "border-slate-300 hover:border-slate-400 focus:border-indigo-500 focus:ring-indigo-500/10"
  }`;
}

function ErrorCampo({ id, mensaje }: { id: string; mensaje?: string }) {
  if (!mensaje) return null;

  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-rose-600"
    >
      <AlertIcon className="mt-px size-3.5 shrink-0" />
      {mensaje}
    </p>
  );
}

interface FormularioTradicionalProps {
  materias: Materia[];
  errorCatalogo: string | null;
}

export function FormularioTradicional({
  materias,
  errorCatalogo,
}: FormularioTradicionalProps) {
  const { registrarReporte } = useReportes();

  const [formulario, setFormulario] = useState<FormState>(FORMULARIO_INICIAL);
  const [errores, setErrores] = useState<Errores>({});
  const [reporteCreado, setReporteCreado] = useState<Reporte | null>(null);
  const [verificacion, setVerificacion] =
    useState<VerificacionAprobada | null>(null);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const materiaSeleccionada = materias.find(
    (materia) => materia.codigo === formulario.materia_codigo,
  );
  const pideDetalle = tipoRequiereDetalle(formulario.tipo_error);

  function actualizar<K extends CampoFormulario>(
    campo: K,
    valor: FormState[K],
  ) {
    setErrorEnvio(null);
    if (campo === "ci") setVerificacion(null);
    setFormulario((previo) => {
      const siguiente: FormState = { ...previo };
      siguiente[campo] = valor;
      // El detalle solo existe para "otro": al cambiar de tipo se descarta.
      if (campo === "tipo_error" && !tipoRequiereDetalle(String(valor))) {
        siguiente.tipo_error_detalle = "";
      }
      return siguiente;
    });

    setErrores((previos) => {
      if (!previos[campo]) return previos;

      const siguientes = { ...previos };
      delete siguientes[campo];
      return siguientes;
    });
  }

  function actualizarCorreo(valor: string) {
    actualizar("correo", valor);
    setVerificacion(null);
  }

  function manejarVerificacion(nueva: VerificacionAprobada | null) {
    setVerificacion(nueva);

    if (nueva) {
      setErrores((previos) => {
        if (!previos.correo) return previos;

        const siguientes = { ...previos };
        delete siguientes.correo;
        return siguientes;
      });
    }
  }

  function validar(): Errores {
    const nuevosErrores: Errores = {};
    const ci = formulario.ci.trim();
    const nombre = formulario.nombre.trim();
    const correo = formulario.correo.trim().toLowerCase();
    const motivo = formulario.motivo.trim();

    if (!esCedulaValida(ci)) {
      nuevosErrores.ci = `Ingresa una cédula válida de ${CEDULA_MIN_DIGITOS} a ${CEDULA_MAX_DIGITOS} dígitos.`;
    }

    if (nombre.length < NOMBRE_MIN) {
      nuevosErrores.nombre = "Ingresa tu nombre completo.";
    }

    if (!esCorreoValido(correo)) {
      nuevosErrores.correo = "Ingresa un correo electrónico válido.";
    } else if (!esCorreoInstitucional(correo)) {
      nuevosErrores.correo = mensajeCorreoInstitucional();
    } else if (verificacion?.correo !== correo || verificacion.ci !== ci) {
      nuevosErrores.correo = "Verifica tu correo antes de enviar el reporte.";
    }

    if (!materias.some((materia) => materia.codigo === formulario.materia_codigo)) {
      nuevosErrores.materia_codigo = "Selecciona una materia válida de la malla.";
    }

    if (!esTipoError(formulario.tipo_error)) {
      nuevosErrores.tipo_error = "Selecciona el tipo de error.";
    } else if (tipoRequiereDetalle(formulario.tipo_error)) {
      const detalle = formulario.tipo_error_detalle.trim();

      if (detalle.length === 0) {
        nuevosErrores.tipo_error_detalle = "Especifica el error.";
      } else if (detalle.length > DETALLE_ERROR_MAX) {
        nuevosErrores.tipo_error_detalle = `Máximo ${DETALLE_ERROR_MAX} caracteres.`;
      }
    }

    if (motivo.length < MOTIVO_MIN) {
      nuevosErrores.motivo =
        `Describe el problema con al menos ${MOTIVO_MIN} caracteres.`;
    }

    return nuevosErrores;
  }

  function limpiarFormulario() {
    setFormulario(FORMULARIO_INICIAL);
    setErrores({});
    setVerificacion(null);
    setErrorEnvio(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (enviando) return;

    const nuevosErrores = validar();

    if (Object.keys(nuevosErrores).length > 0) {
      setErrores(nuevosErrores);

      const primerCampo = Object.keys(nuevosErrores)[0];
      document.getElementById(primerCampo)?.focus();
      return;
    }

    if (!esTipoError(formulario.tipo_error) || !verificacion) return;

    setEnviando(true);
    setErrorEnvio(null);

    try {
      const resultado = await registrarReporte({
        ci: formulario.ci.trim(),
        nombre: formulario.nombre.trim(),
        correo: formulario.correo.trim().toLowerCase(),
        materia_codigo: formulario.materia_codigo,
        tipo_error: formulario.tipo_error,
        tipo_error_detalle: tipoRequiereDetalle(formulario.tipo_error)
          ? formulario.tipo_error_detalle.trim().replace(/\s+/g, " ")
          : "",
        motivo: formulario.motivo.trim(),
        verificacionToken: verificacion.token,
      });

      if (!resultado.ok) {
        setErrorEnvio(
          resultado.ticket
            ? `${resultado.mensaje} Tu ticket anterior es ${resultado.ticket}.`
            : resultado.mensaje,
        );
        return;
      }

      setReporteCreado(resultado.reporte);
      setFormulario(FORMULARIO_INICIAL);
      setErrores({});
      setVerificacion(null);
      setErrorEnvio(null);
    } catch {
      setErrorEnvio(
        "No pudimos registrar el reporte. Intenta nuevamente en unos segundos.",
      );
    } finally {
      setEnviando(false);
    }
  }

  const catalogoVacio = materias.length === 0;

  return (
    <>
      <section
        aria-labelledby="titulo-formulario"
        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="titulo-formulario"
                className="text-lg font-semibold tracking-tight text-slate-900"
              >
                Formulario de reporte de horarios
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                Completa los datos para que podamos identificar y corregir el
                error en tu horario.
              </p>
            </div>
            <span className="hidden shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-100 sm:inline-flex">
              Paso único
            </span>
          </div>
        </div>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="space-y-5 px-5 py-6 sm:px-6"
        >
          {catalogoVacio && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
            >
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              <p>
                {errorCatalogo ??
                  "El catálogo de materias está vacío. Avisa al administrador para que cargue las materias antes de reportar."}
              </p>
            </div>
          )}

          {errorEnvio && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700"
            >
              <AlertIcon className="mt-0.5 size-4 shrink-0" />
              <p>{errorEnvio}</p>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ci"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Cédula <span className="text-rose-500">*</span>
              </label>
              <input
                id="ci"
                name="ci"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={CEDULA_MAX_DIGITOS}
                placeholder="Ej. 12345678"
                value={formulario.ci}
                onChange={(event) =>
                  actualizar(
                    "ci",
                    event.target.value.replace(/\D/g, "").slice(0, CEDULA_MAX_DIGITOS),
                  )
                }
                required
                aria-invalid={Boolean(errores.ci)}
                aria-describedby={errores.ci ? "ci-error" : undefined}
                className={claseControl(Boolean(errores.ci))}
              />
              <ErrorCampo id="ci-error" mensaje={errores.ci} />
            </div>

            <div>
              <label
                htmlFor="nombre"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Nombre <span className="text-rose-500">*</span>
              </label>
              <input
                id="nombre"
                name="nombre"
                type="text"
                autoComplete="name"
                placeholder="Ej. Ana Martínez"
                value={formulario.nombre}
                onChange={(event) => actualizar("nombre", event.target.value)}
                required
                aria-invalid={Boolean(errores.nombre)}
                aria-describedby={errores.nombre ? "nombre-error" : undefined}
                className={claseControl(Boolean(errores.nombre))}
              />
              <ErrorCampo id="nombre-error" mensaje={errores.nombre} />
            </div>
          </div>

          <div>
            <label
              htmlFor="correo"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Correo <span className="text-rose-500">*</span>
            </label>
            <input
              id="correo"
              name="correo"
              type="email"
              autoComplete="email"
              placeholder="nombre@correo-institucional.edu.ve"
              value={formulario.correo}
              onChange={(event) => actualizarCorreo(event.target.value)}
              required
              aria-invalid={Boolean(errores.correo)}
              aria-describedby={errores.correo ? "correo-error" : undefined}
              className={claseControl(Boolean(errores.correo))}
            />
            <ErrorCampo id="correo-error" mensaje={errores.correo} />
            {esCorreoValido(formulario.correo) && !esCedulaValida(formulario.ci) && (
              <p className="mt-1.5 text-[11px] text-slate-500">
                Escribe primero tu cédula para poder verificar el correo.
              </p>
            )}

            {esCorreoValido(formulario.correo) &&
              esCorreoInstitucional(formulario.correo) &&
              esCedulaValida(formulario.ci) && (
              <VerificacionCorreo
                key={`${formulario.correo}|${formulario.ci}`}
                correo={formulario.correo}
                ci={formulario.ci.trim()}
                onVerifiedChange={manejarVerificacion}
              />
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="materia_codigo"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Materia <span className="text-rose-500">*</span>
              </label>
              <select
                id="materia_codigo"
                name="materia_codigo"
                value={formulario.materia_codigo}
                onChange={(event) =>
                  actualizar("materia_codigo", event.target.value)
                }
                required
                disabled={catalogoVacio}
                aria-invalid={Boolean(errores.materia_codigo)}
                aria-describedby={
                  errores.materia_codigo ? "materia_codigo-error" : undefined
                }
                className={claseControl(Boolean(errores.materia_codigo))}
              >
                <option value="">
                  {catalogoVacio
                    ? "Catálogo no disponible"
                    : "Selecciona una materia"}
                </option>
                {materias.map((materia) => (
                  <option key={materia.codigo} value={materia.codigo}>
                    [{materia.nrc}] {materia.nombre}
                  </option>
                ))}
              </select>
              <ErrorCampo
                id="materia_codigo-error"
                mensaje={errores.materia_codigo}
              />
            </div>

            <div>
              <label
                htmlFor="tipo_error"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Tipo de error <span className="text-rose-500">*</span>
              </label>
              <select
                id="tipo_error"
                name="tipo_error"
                value={formulario.tipo_error}
                onChange={(event) => {
                  const valor = event.target.value;
                  actualizar(
                    "tipo_error",
                    valor === "" ? "" : (valor as TipoError),
                  );
                }}
                required
                aria-invalid={Boolean(errores.tipo_error)}
                aria-describedby={
                  errores.tipo_error ? "tipo_error-error" : undefined
                }
                className={claseControl(Boolean(errores.tipo_error))}
              >
                <option value="">Selecciona el tipo de error</option>
                {TIPOS_ERROR.map((tipo) => (
                  <option key={tipo.value} value={tipo.value}>
                    {tipo.label}
                  </option>
                ))}
              </select>
              <ErrorCampo
                id="tipo_error-error"
                mensaje={errores.tipo_error}
              />
            </div>
          </div>

          {materiaSeleccionada && (
            <div className="flex flex-col gap-2 rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-xs text-indigo-900 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2">
                <ClockIcon className="size-4 shrink-0 text-indigo-500" />
                <span>
                  <span className="font-semibold">Horario actual:</span>{" "}
                  {materiaSeleccionada.horario || "No registrado"}
                </span>
              </p>
              <p className="font-mono text-[11px] text-indigo-700/80">
                {materiaSeleccionada.codigo}
              </p>
            </div>
          )}

          {pideDetalle && (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <label
                  htmlFor="tipo_error_detalle"
                  className="block text-sm font-medium text-slate-700"
                >
                  Especifica el error <span className="text-rose-500">*</span>
                </label>
                <span className="text-[11px] tabular-nums text-slate-400">
                  {formulario.tipo_error_detalle.length}/{DETALLE_ERROR_MAX}
                </span>
              </div>
              <input
                id="tipo_error_detalle"
                name="tipo_error_detalle"
                type="text"
                autoComplete="off"
                maxLength={DETALLE_ERROR_MAX}
                placeholder="Ej. La materia no aparece en mi reserva"
                value={formulario.tipo_error_detalle}
                onChange={(event) =>
                  actualizar("tipo_error_detalle", event.target.value)
                }
                required
                aria-invalid={Boolean(errores.tipo_error_detalle)}
                aria-describedby={
                  errores.tipo_error_detalle
                    ? "tipo_error_detalle-error"
                    : undefined
                }
                className={claseControl(Boolean(errores.tipo_error_detalle))}
              />
              <ErrorCampo
                id="tipo_error_detalle-error"
                mensaje={errores.tipo_error_detalle}
              />
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <label
                htmlFor="motivo"
                className="block text-sm font-medium text-slate-700"
              >
                Motivo <span className="text-rose-500">*</span>
              </label>
              <span className="text-[11px] tabular-nums text-slate-400">
                {formulario.motivo.length}/{MOTIVO_MAX}
              </span>
            </div>
            <textarea
              id="motivo"
              name="motivo"
              rows={5}
              maxLength={MOTIVO_MAX}
              placeholder="Describe qué está mal en el horario. Por ejemplo: la clase aparece el martes a las 08:00, pero debería ser el jueves a las 10:00."
              value={formulario.motivo}
              onChange={(event) => actualizar("motivo", event.target.value)}
              required
              aria-invalid={Boolean(errores.motivo)}
              aria-describedby={errores.motivo ? "motivo-error" : undefined}
              className={`${claseControl(Boolean(errores.motivo))} resize-y leading-6`}
            />
            <ErrorCampo id="motivo-error" mensaje={errores.motivo} />
          </div>

          <div className="flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                <ShieldIcon className="mt-0.5 size-4 shrink-0 text-slate-400" />
                Tus datos se usan únicamente para gestionar este reporte.
              </p>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">
                Máximo {CONFIG.maxReportesPorDia} reportes por día · Sin
                duplicados en {CONFIG.ventanaDuplicadosHoras} h.
              </p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={limpiarFormulario}
                disabled={enviando}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Limpiar
              </button>
              <button
                type="submit"
                disabled={enviando}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 active:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-indigo-400"
              >
                {enviando ? (
                  <>
                    <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <SendIcon className="size-4" />
                    Enviar reporte
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </section>

      {reporteCreado && (
        <ModalExito
          reporte={reporteCreado}
          onClose={() => setReporteCreado(null)}
        />
      )}
    </>
  );
}