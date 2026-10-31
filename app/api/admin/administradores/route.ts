import { obtenerAdmin } from "@/lib/admin/sesion";
import { leerCuerpo, respuestaError, respuestaOk, texto } from "@/lib/api/respuestas";
import { obtenerSupabaseAdmin } from "@/lib/supabase/admin";
import { esCorreoValido } from "@/lib/validaciones";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CLAVE_MIN = 10;
/** bcrypt (Supabase Auth) ignora lo que pase de 72 bytes. */
const CLAVE_MAX = 72;
const PAGINAS_BUSQUEDA = 10;

/** Busca un usuario de Supabase Auth por correo (pocas cuentas: basta paginar). */
async function buscarUsuarioPorCorreo(correo: string): Promise<string | null> {
  const supabase = obtenerSupabaseAdmin();

  for (let page = 1; page <= PAGINAS_BUSQUEDA; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;

    const usuario = data.users.find((u) => u.email?.toLowerCase() === correo);
    if (usuario) return usuario.id;
    if (data.users.length < 200) break;
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const admin = await obtenerAdmin(request);
    if (!admin) return respuestaError("verificacion", "Sesión no válida.", 401);

    const supabase = obtenerSupabaseAdmin();
    const { data, error } = await supabase
      .from("administradores")
      .select("user_id,creado_en")
      .order("creado_en", { ascending: true });

    if (error) throw error;

    const administradores = await Promise.all(
      (data ?? []).map(async (fila) => {
        const { data: usuario } = await supabase.auth.admin.getUserById(fila.user_id);

        return {
          userId: fila.user_id,
          email: usuario.user?.email ?? "(sin correo)",
          creadoEn: fila.creado_en,
        };
      }),
    );

    return respuestaOk({ administradores });
  } catch (error) {
    console.error("[api/admin/administradores:GET]", error);
    return respuestaError("interno", "No pudimos cargar los administradores.", 500);
  }
}

/** { correo, clave? }: autoriza a un usuario existente o crea uno nuevo (con clave). */
export async function POST(request: Request) {
  try {
    const admin = await obtenerAdmin(request);
    if (!admin) return respuestaError("verificacion", "Sesión no válida.", 401);

    const cuerpo = await leerCuerpo(request);
    const correo = texto(cuerpo, "correo").toLowerCase();
    const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";

    if (!esCorreoValido(correo) || correo.length > 254) {
      return respuestaError("validacion", "Correo inválido.", 422);
    }

    if (clave && (clave.length < CLAVE_MIN || clave.length > CLAVE_MAX)) {
      return respuestaError(
        "validacion",
        `La contraseña debe tener entre ${CLAVE_MIN} y ${CLAVE_MAX} caracteres.`,
        422,
      );
    }

    const supabase = obtenerSupabaseAdmin();
    let userId: string | null = null;
    let creado = false;

    if (clave) {
      const { data, error } = await supabase.auth.admin.createUser({
        email: correo,
        password: clave,
        email_confirm: true,
      });

      if (data.user) {
        userId = data.user.id;
        creado = true;
      } else if (error?.code !== "email_exists") {
        console.error("[api/admin/administradores:POST] createUser", error);
        return respuestaError("validacion", "No pudimos crear el usuario con esos datos.", 422);
      }
    }

    userId ??= await buscarUsuarioPorCorreo(correo);

    if (!userId) {
      return respuestaError(
        "no_encontrado",
        "Ese usuario no existe. Indica una contraseña temporal para crearlo.",
        404,
      );
    }

    const { error } = await supabase
      .from("administradores")
      .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });

    if (error) throw error;

    console.info(`[admin] ${admin.email} autorizó a ${correo} (${creado ? "nuevo" : "existente"}).`);
    return respuestaOk({ creado, userId }, creado ? 201 : 200);
  } catch (error) {
    console.error("[api/admin/administradores:POST]", error);
    return respuestaError("interno", "No pudimos agregar al administrador.", 500);
  }
}

/** ?id=<user_id>: quita el permiso (no borra al usuario de Supabase Auth). */
export async function DELETE(request: Request) {
  try {
    const admin = await obtenerAdmin(request);
    if (!admin) return respuestaError("verificacion", "Sesión no válida.", 401);

    const id = new URL(request.url).searchParams.get("id") ?? "";

    if (!UUID.test(id)) return respuestaError("validacion", "Datos inválidos.", 422);
    if (id === admin.userId) {
      return respuestaError("validacion", "No puedes quitarte tu propio acceso.", 422);
    }

    const supabase = obtenerSupabaseAdmin();

    const { count, error: errorConteo } = await supabase
      .from("administradores")
      .select("user_id", { count: "exact", head: true });

    if (errorConteo) throw errorConteo;
    if ((count ?? 0) <= 1) {
      return respuestaError("validacion", "Debe quedar al menos un administrador.", 422);
    }

    const { error } = await supabase.from("administradores").delete().eq("user_id", id);
    if (error) throw error;

    console.info(`[admin] ${admin.email} quitó el acceso de ${id}.`);
    return respuestaOk({});
  } catch (error) {
    console.error("[api/admin/administradores:DELETE]", error);
    return respuestaError("interno", "No pudimos quitar al administrador.", 500);
  }
}
