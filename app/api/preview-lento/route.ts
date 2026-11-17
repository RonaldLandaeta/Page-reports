import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Temporal: retrasa el evento load para que la captura espere los datos. */
export async function GET() {
  await new Promise((listo) => setTimeout(listo, 2_500));
  return new NextResponse(
    Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"),
    { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store" } },
  );
}
