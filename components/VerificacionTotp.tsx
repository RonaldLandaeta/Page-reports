"use client";

import { useEffect, useState, type FormEvent } from "react";

import { ErrorApi, postJson } from "@/lib/api-cliente";
import { CONFIG } from "@/lib/config";

import { CheckIcon, CopyIcon, ShieldIcon } from "./icons";

export interface VerificacionAprobada {
  correo: string;
  ci: string;
  token: string;
}

interface VerificacionTotpProps {
  correo: string;
  /** Cédula a la que queda ligado el token (una cédula, varios tokens). */
  ci: string;
  /** Si la identidad ya fue verificada en esta sesión (p. ej. otro reporte). */
  verificadaInicialmente?: boolean;
  onVerifiedChange: (verificacion: VerificacionAprobada | null) => void;
}

type Vista =
  | "comprobando"
  | "verificado"
  | "sin_credencial"
  | "pendiente"
  | "escanear"
  | "activo";

interface DatosQr {
  qr: string;
  secreto: string;
  cuenta: string;
  emisor: string;
}

/**
 * Verificación con app de autenticación (TOTP). El secreto se genera y cifra
 * en el servidor; el navegador solo recibe el token firmado de corta duración.
 */
export function VerificacionTotp({
  correo,
  ci,
  verificadaInicialmente = false,
  onVerifiedChange,
}: VerificacionTotpProps) {
  const normalizado = correo.trim().toLowerCase();
  const [vista, setVista] = useState<Vista>(
    verificadaInicialmente ? "verificado" : "comprobando",
  );
  const [codigoEnrolamiento, setCodigoEnrolamiento] = useState("");
  const [datosQr, setDatosQr] = useState<DatosQr | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [copiado, setCopiado] = useState(false);

  // Al cambiar de cédula se vuelve a preguntar si ya tiene app vinculada.
  useEffect(() => {
    if (verificadaInicialmente) return;

    let vigente = true;

    postJson<{ estado: string }>("/api/verificacion/estado", { ci })
      .then((resultado) => {
        if (!vigente) return;

        if (resultado.estado === "activo") setVista("activo");
        else if (resultado.estado === "pendiente") setVista("pendiente");
        else setVista("sin_credencial");
      })
      .catch((fallo) => {
        if (!vigente) return;
        setVista("sin_credencial");
        setError(
          fallo instanceof ErrorApi
            ? fallo.message
            : "No pudimos comprobar si tu app ya está vinculada.",
        );
      });

    return () => {
      vigente = false;
    };
  }, [ci, verificadaInicialmente]);

  async function enrolar(event: FormEvent) {
    event.preventDefault();
    if (ocupado) return;

    setOcupado(true);
    setError(null);

    try {
      const resultado = await postJson<DatosQr>("/api/verificacion/enrolar", {
        ci,
        codigoEnrolamiento,
      });

      setDatosQr(resultado);
      setCodigo("");
      setVista("escanear");
      onVerifiedChange(null);
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi
          ? fallo.message
          : "No pudimos validar el código de enrolamiento.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar(event: FormEvent) {
    event.preventDefault();

    if (!/^\d{6}$/.test(codigo)) {
      setError("Escribe los 6 dígitos que muestra tu app.");
      return;
    }

    if (ocupado) return;

    setOcupado(true);
    setError(null);

    const enrolamiento = vista === "escanear";

    try {
      const resultado = await postJson<{ token: string }>(
        enrolamiento
          ? "/api/verificacion/confirmar"
          : "/api/verificacion/validar",
        { ci, correo: normalizado, codigo },
      );

      setVista("verificado");
      setCodigo("");
      setDatosQr(null);
      onVerifiedChange({ correo: normalizado, ci, token: resultado.token });
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi
          ? fallo.message
          : "No pudimos validar el código. Intenta de nuevo.",
      );
    } finally {
      setOcupado(false);
    }
  }

  async function copiarSecreto() {
    if (!datosQr) return;

    try {
      await navigator.clipboard.writeText(datosQr.secreto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2000);
    } catch {
      setError("No pudimos copiar el secreto. Escríbelo a mano en la app.");
    }
  }

  const control =
    "min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-base text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 disabled:bg-slate-50 dark:disabled:bg-slate-800 sm:text-sm";
  const boton =
    "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 disabled:cursor-not-allowed disabled:bg-indigo-400";

  if (vista === "comprobando") {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="size-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-700 dark:border-t-slate-300" />
        Comprobando tu app de autenticación...
      </p>
    );
  }

  if (vista === "verificado") {
    return (
      <div
        aria-live="polite"
        className="mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5"
      >
        <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div>
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            Identidad verificada
          </p>
          <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
            Código de un solo uso válido por{" "}
            {CONFIG.duracionTokenVerificacionMinutos} minutos.
          </p>
        </div>
      </div>
    );
  }

  if (vista === "sin_credencial" || vista === "pendiente") {
    return (
      <form
        onSubmit={enrolar}
        className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3"
      >
        <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-600 dark:text-slate-400">
          <ShieldIcon className="mt-0.5 size-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
          <span>
            {vista === "pendiente"
              ? "Tu enrolamiento quedó a medias. Vuelve a escribir el código que te entregó el administrador."
              : "Para comprobar tu identidad necesitas una app de autenticación. Pide a un administrador un código de enrolamiento de un solo uso."}
          </span>
        </p>

        <div className="mt-2.5 flex gap-2">
          <input
            type="text"
            autoComplete="one-time-code"
            spellCheck={false}
            autoCapitalize="characters"
            maxLength={14}
            placeholder="Código de enrolamiento"
            aria-label="Código de enrolamiento"
            aria-invalid={Boolean(error)}
            value={codigoEnrolamiento}
            onChange={(evento) => {
              setCodigoEnrolamiento(
                evento.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
              );
              if (error) setError(null);
            }}
            disabled={ocupado}
            className={`${control} font-mono tracking-widest`}
          />
          <button type="submit" disabled={ocupado} className={boton}>
            {ocupado ? "Comprobando..." : "Continuar"}
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
            {error}
          </p>
        )}
      </form>
    );
  }

  if (vista === "escanear" && datosQr) {
    return (
      <div className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
          Vincula tu app de autenticación
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-400">
          Escanea el QR con Google Authenticator, Authy, 1Password o Microsoft
          Authenticator. Después escribe el código de 6 dígitos que aparezca.
        </p>

        <div className="mt-3 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {/* El QR lo genera el servidor a partir de un otpauth:// de un solo uso. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={datosQr.qr}
            alt="Código QR para vincular la app de autenticación"
            width={150}
            height={150}
            className="rounded-lg bg-white p-1.5 ring-1 ring-slate-200 dark:ring-slate-700"
          />

          <div className="min-w-0 flex-1">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              ¿No puedes escanear? Ingresa este secreto:
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs text-slate-800 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700">
                {datosQr.secreto}
              </code>
              <button
                type="button"
                onClick={() => void copiarSecreto()}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              >
                <CopyIcon className="size-3.5" />
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              Cuenta: <span className="font-mono">{datosQr.cuenta}</span>
            </p>
          </div>
        </div>

        <form onSubmit={confirmar} className="mt-3">
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="Código de 6 dígitos"
              aria-label="Primer código de la app de autenticación"
              aria-invalid={Boolean(error)}
              value={codigo}
              onChange={(evento) => {
                setCodigo(evento.target.value.replace(/\D/g, "").slice(0, 6));
                if (error) setError(null);
              }}
              disabled={ocupado}
              className={`${control} tracking-widest`}
            />
            <button type="submit" disabled={ocupado} className={boton}>
              {ocupado ? "Confirmando..." : "Confirmar"}
            </button>
          </div>

          {error && (
            <p role="alert" className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}
        </form>
      </div>
    );
  }

  // Credencial ya activa: solo se pide el código del momento.
  return (
    <form
      onSubmit={confirmar}
      className="mt-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 p-3"
    >
      <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-600 dark:text-slate-400">
        <ShieldIcon className="mt-0.5 size-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
        <span>
          Abre tu app de autenticación y escribe el código de 6 dígitos para{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            la cédula {ci}
          </span>
          .
        </span>
      </p>

      <div className="mt-2.5 flex gap-2">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="Código de 6 dígitos"
          aria-label="Código de la app de autenticación"
          aria-invalid={Boolean(error)}
          value={codigo}
          onChange={(evento) => {
            setCodigo(evento.target.value.replace(/\D/g, "").slice(0, 6));
            if (error) setError(null);
          }}
          disabled={ocupado}
          className={`${control} tracking-widest`}
        />
        <button type="submit" disabled={ocupado} className={boton}>
          {ocupado ? "Validando..." : "Verificar"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
          {error}
        </p>
      )}

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        ¿Cambiaste de teléfono? Pide a un administrador que reinicie tu app.
      </p>
    </form>
  );
}
