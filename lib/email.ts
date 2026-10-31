import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

import { getTipoErrorLabel } from "@/lib/catalogos";
import type { Reporte } from "@/lib/types";

const REMITENTE_RESEND =
  process.env.EMAIL_FROM?.trim() ||
  "Reportes Horarios <onboarding@resend.dev>";

let clienteResend: Resend | null = null;
let transporteGmail: Transporter | null = null;

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
  // Google muestra la contraseña de aplicación con espacios; se quitan.
  const clave = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");

  if (!usuario || !clave) return null;

  transporteGmail ??= nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: usuario, pass: clave },
  });

  const configurado = process.env.EMAIL_FROM?.trim();
  const remitente =
    configurado && configurado.toLowerCase().includes(usuario.toLowerCase())
      ? configurado
      : `Reportes Horarios <${usuario}>`;

  return { transporte: transporteGmail, remitente };
}

/**
 * Orden de preferencia:
 *   1. Resend (si hay RESEND_API_KEY).
 *   2. Gmail SMTP (si hay GMAIL_USER + GMAIL_APP_PASSWORD).
 *   3. Modo desarrollo: no envía, deja el código en consola/pantalla.
 */
async function enviar(
  correo: string,
  asunto: string,
  html: string,
  texto: string,
) {
  const cliente = resend();

  if (cliente) {
    const { error } = await cliente.emails.send({
      from: REMITENTE_RESEND,
      to: correo,
      subject: asunto,
      html,
      text: texto,
    });

    if (error) throw new Error(`Resend: ${error.message}`);
    return { enviado: true as const, proveedor: "resend" as const };
  }

  const cuentaGmail = gmail();

  if (cuentaGmail) {
    await cuentaGmail.transporte.sendMail({
      from: cuentaGmail.remitente,
      to: correo,
      subject: asunto,
      html,
      text: texto,
    });

    return { enviado: true as const, proveedor: "gmail" as const };
  }

  console.info(
    `[email:dev] Sin proveedor configurado. Correo a ${correo}: ${asunto}`,
  );

  return { enviado: false as const, proveedor: "dev" as const };
}

export async function enviarCodigoVerificacion(
  correo: string,
  codigo: string,
  minutos: number,
) {
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

export async function enviarConfirmacionReporte(reporte: Reporte) {
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
