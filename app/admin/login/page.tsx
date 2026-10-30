"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { ErrorApi, postJson } from "@/lib/api-cliente";

export default function AdminLoginPage() {
  const router = useRouter();
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(event: FormEvent) {
    event.preventDefault();
    if (enviando) return;

    setEnviando(true);
    setError(null);

    try {
      await postJson("/api/admin/login", { correo, clave });
      router.replace("/admin");
    } catch (fallo) {
      setError(fallo instanceof ErrorApi ? fallo.message : "No pudimos iniciar sesión.");
    } finally {
      setEnviando(false);
    }
  }

  const control =
    "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/10";

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <form onSubmit={entrar} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">Acceso de administración</h1>
        <p className="mt-1 text-sm text-slate-500">Solo personal autorizado.</p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <label htmlFor="correo" className="mt-4 block text-sm font-medium text-slate-700">Correo</label>
        <input id="correo" type="email" autoComplete="username" required value={correo}
          onChange={(e) => setCorreo(e.target.value)} className={`${control} mt-1.5`} />

        <label htmlFor="clave" className="mt-4 block text-sm font-medium text-slate-700">Contraseña</label>
        <input id="clave" type="password" autoComplete="current-password" required value={clave}
          onChange={(e) => setClave(e.target.value)} className={`${control} mt-1.5`} />

        <button type="submit" disabled={enviando}
          className="mt-6 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-indigo-400">
          {enviando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </main>
  );
}
