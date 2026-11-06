import { esSuperAdmin, obtenerAdmin, type RolAdmin } from "@/lib/admin/sesion";
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
const MENSAJE_ULTIMO_SUPER = "Debe quedar al menos un super administrador.";

function rolValido(valor: unknown): RolAdmin | null {
  return valor === "admin" || valor === "super" ? valor : null;
}

/** Solo un super administrador puede gestionar administradores. */
async function exigirSuper(request: Request) {
  const admin = await obtenerAdmin(request);

  if (!admin) {
    return { admin: null, error: respuestaError("verificacion", "Sesión no válida.", 401) };
  }

  if (!esSuperAdmin(admin)) {
    return {
      admin: null,
      error: respuestaError("verificacion", "Solo un super administrador puede hacer esto.", 403),
    };
  }

  return { admin, error: null };
}

/** El trigger de la base protege al último super aunque dos peticiones choquen. */
function esErrorUltimoSuper(error: { message?: string } | null): boolean {
  return Boolean(error?.message?.includes("super administrador"));
}

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
    const { error: denegado } = await exigirSuper(request);
    if (denegado) return denegado;

    const supabase = obtenerSupabaseAdmin();
    const { data, error } = await supabase
      .from("administradores")
      .select("user_id,rol,creado_en")
      .order("creado_en", { ascending: true });

    if (error) throw error;

    const administradores = await Promise.all(
      (data ?? []).map(async (fila) => {
        const { data: usuario } = await supabase.auth.admin.getUserById(fila.user_id);

        return {
          userId: fila.user_id,
          email: usuario.user?.email ?? "(sin correo)",
          rol: fila.rol,
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

/** { correo, clave?, rol? }: autoriza a un usuario existente o crea uno nuevo (con clave). */
export async function POST(request: Request) {
  try {
    const { admin, error: denegado } = await exigirSuper(request);
    if (denegado) return denegado;

    const cuerpo = await leerCuerpo(request);
    const correo = texto(cuerpo, "correo").toLowerCase();
    const clave = typeof cuerpo?.clave === "string" ? cuerpo.clave : "";
    const rol = rolValido(cuerpo?.rol) ?? "admin";

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

    // Si ya era administrador no se toca su rol (para eso está PATCH).
    const { error } = await supabase
      .from("administradores")
      .upsert({ user_id: userId, rol }, { onConflict: "user_id", ignoreDuplicates: true });

    if (error) throw error;

    console.info(`[admin] ${admin.email} autorizó a ${correo} como ${rol} (${creado ? "nuevo" : "existente"}).`);
    return respuestaOk({ creado, userId }, creado ? 201 : 200);
  } catch (error) {
    console.error("[api/admin/administradores:POST]", error);
    return respuestaError("interno", "No pudimos agregar al administrador.", 500);
  }
}

/** { id, rol }: cambia el rol de otro administrador. */
export async function PATCH(request: Request) {
  try {
    const { admin, error: denegado } = await exigirSuper(request);
    if (denegado) return denegado;

    const cuerpo = await leerCuerpo(request);
    const id = texto(cuerpo, "id");
    const rol = rolValido(cuerpo?.rol);

    if (!UUID.test(id) || !rol) return respuestaError("validacion", "Datos inválidos.", 422);
    if (id === admin.userId) {
      return respuestaError("validacion", "No puedes cambiar tu propio rol.", 422);
    }

    const { data, error } = await obtenerSupabaseAdmin()
      .from("administradores")
      .update({ rol })
      .eq("user_id", id)
      .select("user_id");

    if (error) {
      if (esErrorUltimoSuper(error)) return respuestaError("validacion", MENSAJE_ULTIMO_SUPER, 422);
      throw error;
    }

    if (!data?.length) return respuestaError("no_encontrado", "Administrador no encontrado.", 404);

    console.info(`[admin] ${admin.email} cambió el rol de ${id} a ${rol}.`);
    return respuestaOk({});
  } catch (error) {
    console.error("[api/admin/administradores:PATCH]", error);
    return respuestaError("interno", "No pudimos cambiar el rol.", 500);
  }
}

/** ?id=<user_id>: quita el permiso (no borra al usuario de Supabase Auth). */
export async function DELETE(request: Request) {
  try {
    const { admin, error: denegado } = await exigirSuper(request);
    if (denegado) return denegado;

    const id = new URL(request.url).searchParams.get("id") ?? "";

    if (!UUID.test(id)) return respuestaError("validacion", "Datos inválidos.", 422);
    if (id === admin.userId) {
      return respuestaError("validacion", "No puedes quitarte tu propio acceso.", 422);
    }

    const { data, error } = await obtenerSupabaseAdmin()
      .from("administradores")
      .delete()
      .eq("user_id", id)
      .select("user_id");

    if (error) {
      if (esErrorUltimoSuper(error)) return respuestaError("validacion", MENSAJE_ULTIMO_SUPER, 422);
      throw error;
    }

    if (!data?.length) return respuestaError("no_encontrado", "Administrador no encontrado.", 404);

    console.info(`[admin] ${admin.email} quitó el acceso de ${id}.`);
    return respuestaOk({});
  } catch (error) {
    console.error("[api/admin/administradores:DELETE]", error);
    return respuestaError("interno", "No pudimos quitar al administrador.", 500);
  }
}
