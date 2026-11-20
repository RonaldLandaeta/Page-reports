"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ErrorApi, postJson } from "@/lib/api-cliente";

import { EyeIcon, EyeOffIcon, ShieldIcon } from "@/components/icons";
import { LogoMarca } from "@/components/LogoMarca";
import { ThemeToggle } from "@/components/ThemeToggle";

type Fase = "clave" | "totp" | "enrolar";

interface DatosQr {
  qr: string;
  secreto: string;
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [fase, setFase] = useState<Fase>("clave");
  const [tokenPreAuth, setTokenPreAuth] = useState("");
  const [datosQr, setDatosQr] = useState<DatosQr | null>(null);
  const [codigo, setCodigo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const control =
    "w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-base text-slate-900 dark:text-slate-100 transition-colors placeholder:text-slate-500 dark:placeholder:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 sm:text-sm";

  function volverAlInicio() {
    setFase("clave");
    setTokenPreAuth("");
    setDatosQr(null);
    setCodigo("");
    setError(null);
    setClave("");
  }

  async function entrar(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);

    try {
      const resultado = await postJson<{
        requiereTotp: boolean;
        tokenPreAuth: string;
      }>("/api/admin/login", { correo, clave });

      setTokenPreAuth(resultado.tokenPreAuth);
      setCodigo("");

      if (resultado.requiereTotp) {
        setFase("totp");
        return;
      }

      // Primera vez: el mismo token previo autoriza a mostrar el QR.
      const qr = await postJson<DatosQr>("/api/admin/totp/enrolar", {
        tokenPreAuth: resultado.tokenPreAuth,
      });
      setDatosQr(qr);
      setFase("enrolar");
    } catch (fallo) {
      setError(
        fallo instanceof ErrorApi ? fallo.message : "No pudimos iniciar sesión.",
      );
    } finally {
      setEnviando(false);
    }
  }

  async function confirmar(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;

    if (!/^\d{6}$/.test(codigo)) {
      setError("Escribe los 6 dígitos que muestra tu app de autenticación.");
      return;
    }

    setEnviando(true);
    setError(null);

    try {
      await postJson(
        fase === "enrolar"
          ? "/api/admin/totp/confirmar"
          : "/api/admin/totp/validar",
        { tokenPreAuth, codigo },
      );

      router.replace("/admin");
    } catch (fallo) {
      setCodigo("");

      if (
        fallo instanceof ErrorApi &&
        fallo.message.toLowerCase().includes("expiró")
      ) {
        volverAlInicio();
      }

      setError(
        fallo instanceof ErrorApi
          ? fallo.message
          : "No pudimos comprobar el código. Intenta de nuevo.",
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4 py-10">
      <div className="fixed right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <LogoMarca className="h-12 w-auto" />
        <h1 className="mt-4 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Acceso de administración
        </h1>
        <p className="mt-1 text-pretty text-sm text-slate-500 dark:text-slate-400">
          {fase === "clave"
            ? "Solo personal autorizado."
            : "Confirma tu identidad con la app de autenticación."}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300"
          >
            {error}
          </p>
        )}

        {fase === "clave" ? (
          <form onSubmit={entrar}>
            <label
              htmlFor="correo"
              className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Correo
            </label>
            <input
              id="correo"
              type="email"
              autoComplete="username"
              spellCheck={false}
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className={`${control} mt-1.5`}
            />

            <label
              htmlFor="clave"
              className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Contraseña
            </label>
            <div className="relative mt-1.5">
              <input
                id="clave"
                type={verClave ? "text" : "password"}
                autoComplete="current-password"
                required
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                className={`${control} pr-11`}
              />
              <button
                type="button"
                onClick={() => setVerClave((valor) => !valor)}
                aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                aria-pressed={verClave}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-500 transition-colors hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {verClave ? (
                  <EyeOffIcon className="size-4" />
                ) : (
                  <EyeIcon className="size-4" />
                )}
              </button>
            </div>

            <button
              type="submit"
              disabled={enviando}
              className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 active:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {enviando ? "Comprobando..." : "Continuar"}
            </button>
          </form>
        ) : (
          <form onSubmit={confirmar}>
            {fase === "enrolar" && (
              <div className="mt-4">
                {datosQr ? (
                  <>
                    <p className="flex items-start gap-1.5 text-xs leading-5 text-slate-600 dark:text-slate-400">
                      <ShieldIcon className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        Vincular la app es obligatorio para entrar. Escanea el QR
                        con Google Authenticator, Authy, 1Password o Microsoft
                        Authenticator.
                      </span>
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={datosQr.qr}
                      alt="Código QR para vincular la app de autenticación"
                      width={180}
                      height={180}
                      className="mx-auto mt-3 rounded-lg bg-white p-2 ring-1 ring-slate-200 dark:ring-slate-700"
                    />
                    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                      ¿No puedes escanear? Ingresa este secreto:
                    </p>
                    <code className="mt-1 block break-all rounded-lg bg-slate-50 px-2.5 py-2 font-mono text-xs text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700">
                      {datosQr.secreto}
                    </code>
                  </>
                ) : (
                  <p className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className="size-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-700 dark:border-t-slate-300" />
                    Preparando el código QR...
                  </p>
                )}
              </div>
            )}

            <label
              htmlFor="codigo"
              className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {fase === "enrolar"
                ? "Escribe el primer código que muestre la app"
                : "Código de 6 dígitos"}
            </label>
            <input
              id="codigo"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              required
              placeholder="000000"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6));
                if (error) setError(null);
              }}
              className={`${control} mt-1.5 text-center font-mono text-xl tracking-[0.4em]`}
            />

            <button
              type="submit"
              disabled={enviando || (fase === "enrolar" && !datosQr)}
              className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/25 active:bg-indigo-800 disabled:cursor-not-allowed disabled:bg-indigo-400"
            >
              {enviando
                ? "Comprobando..."
                : fase === "enrolar"
                  ? "Vincular y entrar"
                  : "Entrar"}
            </button>

            <button
              type="button"
              onClick={volverAlInicio}
              disabled={enviando}
              className="mt-3 w-full rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50"
            >
              Volver al inicio de sesión
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
