"use client";

import { useState } from "react";

import { CONFIG } from "@/lib/config";
import { esCorreoValido } from "@/lib/validaciones";
import {
  generarCodigoVerificacion,
  verificarCodigo,
  type CodigoVerificacion,
} from "@/lib/verificacion";

import { CheckIcon, MailIcon } from "./icons";

interface VerificacionCorreoProps {
  correo: string;
  onVerifiedChange: (correo: string | null) => void;
}

/**
 * Verificación simulada para el prototipo. El código se genera en el cliente
 * y se muestra en pantalla; al integrar backend debe enviarse por correo y
 * validarse en el servidor.
 */
export function VerificacionCorreo({
  correo,
  onVerifiedChange,
}: VerificacionCorreoProps) {
  const [codigo, setCodigo] = useState<CodigoVerificacion | null>(null);
  const [ingresado, setIngresado] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verificado, setVerificado] = useState(false);

  if (!esCorreoValido(correo)) return null;

  function generarCodigo() {
    const nuevoCodigo = generarCodigoVerificacion();

    setCodigo(nuevoCodigo);
    setIngresado("");
    setError(null);
    setVerificado(false);
    onVerifiedChange(null);

    console.info(
      `[demo] Código de verificación para ${correo}: ${nuevoCodigo.valor}`,
    );
  }

  function confirmarCodigo() {
    if (!codigo) {
      setError("Solicita un código antes de confirmar.");
      return;
    }

    const resultado = verificarCodigo(codigo, ingresado);

    if (resultado === "expirado") {
      setError("El código expiró. Solicita uno nuevo.");
      return;
    }

    if (resultado !== "ok") {
      setError("El código no coincide. Revisa los 6 dígitos e intenta de nuevo.");
      return;
    }

    setError(null);
    setVerificado(true);
    onVerifiedChange(correo.trim().toLowerCase());
  }

  if (verificado) {
    return (
      <div
        aria-live="polite"
        className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5"
      >
        <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <div>
          <p className="text-xs font-semibold text-emerald-800">
            Correo verificado
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-700">{correo}</p>
        </div>
      </div>
    );
  }

  if (!codigo) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={generarCodigo}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <MailIcon className="size-3.5" />
          Verificar correo
        </button>
        <p className="text-[11px] text-slate-500">
          Enviaremos un código de 6 dígitos (simulado).
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
          <MailIcon className="size-3.5" />
          Simulación de envío
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-800">
          No se envió un correo real. En este prototipo usa el código:
        </p>
        <p className="mt-1 font-mono text-lg font-bold tracking-[0.3em] text-amber-900">
          {codigo.valor}
        </p>
      </div>

      <div className="mt-2.5 flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="Código de 6 dígitos"
          aria-label="Código de verificación"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "codigo-verificacion-error" : undefined}
          value={ingresado}
          onChange={(event) => {
            setIngresado(event.target.value.replace(/\D/g, "").slice(0, 6));
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              confirmarCodigo();
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 tracking-widest placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10"
        />
        <button
          type="button"
          onClick={confirmarCodigo}
          className="shrink-0 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25"
        >
          Confirmar
        </button>
      </div>

      {error && (
        <p
          id="codigo-verificacion-error"
          role="alert"
          className="mt-2 text-[11px] font-medium text-rose-600"
        >
          {error}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-slate-500">
          Válido por {CONFIG.duracionCodigoVerificacionMinutos} minutos.
        </p>
        <button
          type="button"
          onClick={generarCodigo}
          className="text-[11px] font-semibold text-indigo-600 underline-offset-2 hover:underline"
        >
          Reenviar código
        </button>
      </div>
    </div>
  );
}
