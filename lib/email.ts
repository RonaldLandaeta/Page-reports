import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

import { getTipoErrorLabel } from "@/lib/catalogos";
import type { Reporte } from "@/lib/types";

const REMITENTE_RESEND =
  process.env.EMAIL_FROM?.trim() ||
  "Reportes Horarios <onboarding@resend.dev>";

/** Evita que un proveedor caído deje la petición colgada. */
const TIMEOUT_ENVIO_MS = 10_000;

let clienteResend: Resend | null = null;
let transporteGmail: Transporter | null = null;

export interface ResultadoEnvio {
  /** `false` si no había proveedor o si el envío falló. Nunca se simula. */
  enviado: boolean;
  proveedor: "resend" | "gmail" | "dev";
}

function escaparHtml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;

  clienteResend ??= new Resend(apiKey);
  return clienteResend;
}

function gmail(): { transporte: Transporter; remitente: string } | null {
  const usuario = process.env.GMAIL_USER?.trim();
  const clave = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!usuario || !clave) return null;

  transporteGmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: usuario, pass: clave },
    connectionTimeout: TIMEOUT_ENVIO_MS,
    greetingTimeout: TIMEOUT_ENVIO_MS,
    socketTimeout: TIMEOUT_ENVIO_MS,
  });

  const configurado = process.env.EMAIL_FROM?.trim();
  const remitente =
    configurado && configurado.toLowerCase().includes(usuario.toLowerCase())
      ? configurado
      : `Reportes Horarios <${usuario}>`;

  return { transporte: transporteGmail, remitente };
}

async function enviar(
  correo: string,
  asunto: string,
  html: string,
  texto: string,
): Promise<ResultadoEnvio> {
  const cliente = resend();

  // 1. Resend. El SDK acepta un AbortSignal, así que el timeout corta la
  //    conexión real en lugar de dejar la promesa pendiente.
  if (cliente) {
    const controlador = new AbortController();
    const temporizador = setTimeout(
      () => controlador.abort(),
      TIMEOUT_ENVIO_MS,
    );

    try {
      const { data, error } = await cliente.emails.send(
        {
          from: REMITENTE_RESEND,
          to: correo,
          subject: asunto,
          html,
          text: texto,
        },
        { signal: controlador.signal },
      );

      if (!error && data) {
        return { enviado: true, proveedor: "resend" };
      }

      console.error(
        `[email] Resend rechazó el envío: ${error?.message ?? "sin detalle"}`,
      );
    } catch (error) {
      console.error("[email] Resend no respondió a tiempo o falló:", error);
    } finally {
      clearTimeout(temporizador);
    }
  }

  // 2. Gmail SMTP.
  const cuentaGmail = gmail();

  if (cuentaGmail) {
    try {
      await cuentaGmail.transporte.sendMail({
        from: cuentaGmail.remitente,
        to: correo,
        subject: asunto,
        html,
        text: texto,
      });

      return { enviado: true, proveedor: "gmail" };
    } catch (error) {
      console.error("[email] Gmail SMTP falló:", error);
    }
  }

  // 3. Sin proveedor (o todos fallaron): NO se simula un envío exitoso.
  //    El llamador decidirá si muestra el código en desarrollo o responde 503.
  console.warn(
    "[email] no se pudo enviar el correo: no hay proveedor disponible o el envío falló.",
  );

  return { enviado: false, proveedor: "dev" };
}

export async function enviarCodigoVerificacion(
  correo: string,
  codigo: string,
  minutos: number,
): Promise<ResultadoEnvio> {
  const asunto = "Tu código de verificación";
  const texto = [
    `Tu código de verificación es: ${codigo}`,
    "",
    `Vence en ${minutos} minutos.`,
    "Si no solicitaste este código, ignora este mensaje.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
      <h1 style="font-size:20px;margin:0 0 8px">Verifica tu correo</h1>
      <p style="font-size:14px;line-height:22px;color:#475569;margin:0 0 20px">
        Usa este código para confirmar tu correo y registrar el reporte de horario.
      </p>
      <p style="font-family:ui-monospace,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:#4338ca;background:#eef2ff;border-radius:12px;padding:16px;text-align:center;margin:0 0 20px">
        ${escaparHtml(codigo)}
      </p>
      <p style="font-size:13px;line-height:20px;color:#64748b;margin:0">
        El código vence en ${minutos} minutos. Si no solicitaste este código, ignora este mensaje.
      </p>
    </div>
  `;

  return enviar(correo, asunto, html, texto);
}

export async function enviarConfirmacionReporte(
  reporte: Reporte,
): Promise<ResultadoEnvio> {
  const asunto = `Reporte ${reporte.ticket} recibido`;
  const texto = [
    `Hola ${reporte.nombre},`,
    "",
    `Recibimos tu reporte ${reporte.ticket}.`,
    `Materia: ${reporte.materiaNombre} (NRC ${reporte.nrc}, código ${reporte.materiaCodigo})`,
    `Tipo de error: ${getTipoErrorLabel(reporte.tipo_error)}${reporte.tipoErrorDetalle ? ` — ${reporte.tipoErrorDetalle}` : ""}`,
    `Estado inicial: pendiente de revisión`,
    "",
    "Guarda el ticket. Lo necesitarás junto con tu cédula para consultar el estado.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
      <h1 style="font-size:20px;margin:0 0 8px">Reporte recibido</h1>
      <p style="font-size:14px;line-height:22px;color:#475569;margin:0 0 20px">
        Hola ${escaparHtml(reporte.nombre)}, recibimos tu reporte correctamente.
      </p>
      <p style="font-family:ui-monospace,monospace;font-size:24px;font-weight:700;letter-spacing:4px;color:#4338ca;background:#eef2ff;border-radius:12px;padding:14px;text-align:center;margin:0 0 20px">
        ${escaparHtml(reporte.ticket)}
      </p>
      <table style="width:100%;font-size:14px;line-height:22px;color:#334155;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#64748b">Materia</td><td style="padding:6px 0;text-align:right;font-weight:600">${escaparHtml(reporte.materiaNombre)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">NRC</td><td style="padding:6px 0;text-align:right;font-weight:600">${escaparHtml(reporte.nrc)} · ${escaparHtml(reporte.materiaCodigo)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Tipo de error</td><td style="padding:6px 0;text-align:right;font-weight:600">${escaparHtml(getTipoErrorLabel(reporte.tipo_error))}${reporte.tipoErrorDetalle ? ` — ${escaparHtml(reporte.tipoErrorDetalle)}` : ""}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Estado</td><td style="padding:6px 0;text-align:right;font-weight:600">Pendiente de revisión</td></tr>
      </table>
      <p style="font-size:13px;line-height:20px;color:#64748b;margin:20px 0 0">
        Guarda este ticket. Junto con tu cédula te permitirá consultar el estado del reporte.
      </p>
    </div>
  `;

  return enviar(reporte.correo, asunto, html, texto);
}
