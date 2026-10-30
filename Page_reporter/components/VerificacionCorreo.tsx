"use client";

import { useEffect, useState } from "react";

import { ErrorApi, postJson } from "@/lib/api-cliente";
import { CONFIG } from "@/lib/config";
import { esCorreoValido } from "@/lib/validaciones";

import { CheckIcon, MailIcon } from "./icons";

export interface VerificacionAprobada {
  correo: string;
  ci: string;
  token: string;
}

interface VerificacionCorreoProps {
  correo: string;
  /** Cédula a la que queda ligado el token (una cédula, varios tokens). */
  ci: string;
  onVerifiedChange: (verificacion: VerificacionAprobada | null) => void;
}

type Fase = "inicial" | "enviando" | "enviado" | "validando" | "verificado";

/**
 * Verificación real: el código se genera y valida en el servidor, se envía por
 * Resend y el cliente solo recibe un token firmado de corta duración.
 */
export function VerificacionCorreo({
  correo,
  ci,
  onVerifiedChange,
}: VerificacionCorreoProps) {
  const normalizado = correo.trim().toLowerCase();
  const [fase, setFase] = useState<Fase>("inicial");
  const [codigo, setCodigo] = useState("");
  const [codigoDemo, setCodigoDemo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;

    const intervalo = window.setInterval(() => {
      setCooldown((valor) => Math.max(0, valor - 1));
    }, 1000);

    return () => window.clearInterval(intervalo);
  }, [cooldown]);

  if (!esCorreoValido(correo)) return null;

  async function solicitar() {
    if (cooldown > 0 || fase === "enviando" || fase === "validando") return;

    setFase("enviando");
    setError(null);

    try {
      const resultado = await postJson<{
        expiraEn: string;
        codigoDemo?: string;
      }>("/api/verificacion/solicitar", { correo: normalizado });

      setCodigo("");
      setCodigoDemo(resultado.codigoDemo ?? null);
      setFase("enviado");
      setCooldown(CONFIG.segundosEntreSolicitudes);
      onVerifiedChange(null);
    } catch (fallo) {
      setFase("inicial");
      setError(
        fallo instanceof ErrorApi
          ? fallo.message
          : "No pudimos enviar el código. Intenta de nuevo.",
      );
    }
  }

  async function confirmar() {
    if (!/^\d{6}$/.test(codigo)) {
      setError("Escribe los 6 dígitos del código.");
      return;
    }

    setFase("validando");
    setError(null);

    try {
      const resultado = await postJson<{ token: string }>(
        "/api/verificacion/validar",
        { correo: normalizado, codigo, ci },
      );

      setFase("verificado");
      setCodigoDemo(null);
      onVerifiedChange({ correo: normalizado, ci, token: resultado.token });
    } catch (fallo) {
      setFase("enviado");
      setError(
        fallo instanceof ErrorApi
          ? fallo.message
          : "No pudimos validar el código. Intenta de nuevo.",
      );
    }
  }

  if (fase === "verificado") {
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
          <p className="mt-0.5 text-[11px] text-emerald-700">{normalizado}</p>
        </div>
      </div>
    );
  }

  if (fase === "inicial" || fase === "enviando") {
    return (
      <div className="mt-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={solicitar}
            disabled={fase === "enviando"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fase === "enviando" ? (
              <>
                <span className="size-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                Enviando...
              </>
            ) : (
              <>
                <MailIcon className="size-3.5" />
                Verificar correo
              </>
            )}
          </button>
          <p className="text-[11px] text-slate-500">
            Enviaremos un código de 6 dígitos.
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-[11px] font-medium text-rose-600">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-600">
        <MailIcon className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
        <span>
          Enviamos un código de 6 dígitos a{" "}
          <span className="font-semibold text-slate-800">{normalizado}</span>.
        </span>
      </p>

      {codigoDemo && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            Modo desarrollo
          </p>
          <p className="mt-1 text-xs leading-5 text-amber-800">
            No se envió un correo real. Usa este código:
          </p>
          <p className="mt-1 font-mono text-lg font-bold tracking-[0.3em] text-amber-900">
            {codigoDemo}
          </p>
        </div>
      )}

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
          value={codigo}
          onChange={(event) => {
            setCodigo(event.target.value.replace(/\D/g, "").slice(0, 6));
            if (error) setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void confirmar();
            }
          }}
          disabled={fase === "validando"}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm tracking-widest text-slate-900 placeholder:tracking-normal placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50"
        />
        <button
          type="button"
          onClick={confirmar}
          disabled={fase === "validando"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 disabled:cursor-not-allowed disabled:bg-indigo-400"
        >
          {fase === "validando" ? (
            <>
              <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              Validando...
            </>
          ) : (
            "Confirmar"
          )}
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
          onClick={solicitar}
          disabled={cooldown > 0 || fase === "validando"}
          className="text-[11px] font-semibold text-indigo-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
        >
          {cooldown > 0 ? `Reenviar en ${cooldown}s` : "Reenviar código"}
        </button>
      </div>
    </div>
  );
}
