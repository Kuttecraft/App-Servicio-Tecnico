import { supabase } from '../lib/supabase';

/**
 * Representa un técnico/autor en tu sistema.
 * `activo` sirve para saber si ese técnico está operativo.
 */
export type Autor = {
  id: number;
  nombre?: string;
  apellido?: string;
  activo?: boolean;
};

/**
 * resolverAutor(locals)
 * --------------------------------------------------
 * Intenta determinar el "autor" (técnico) actual a partir
 * del request actual (locals).
 *
 * Orden de resolución:
 *
 * 1) Por ID directo:
 *    - Si en locals.tecnico_id viene un ID numérico válido (>0),
 *      buscamos ese técnico en la tabla `tecnicos`.
 *      Si existe → lo devolvemos.
 *
 * 2) Por email:
 *    - Si no hay tecnico_id válido, buscamos un email en uno de estos lugares:
 *        locals.user.email
 *        locals.perfil.email
 *        locals.usuario.email
 *      (esto cubre distintos orígenes según de dónde venga la sesión)
 *
 *    - Si tenemos email, buscamos en `tecnicos` una fila cuyo `email`
 *      coincida (case-insensitive con .ilike).
 *      Si existe → la devolvemos.
 *
 * 3) Alta automática:
 *    - Si no existe todavía un técnico con ese email,
 *      creamos uno nuevo en `tecnicos` con:
 *        { nombre, apellido, email, activo: true }
 *      El nombre/apellido inicial se infiere a partir del email con deriveNameFromEmail().
 *
 * Si nada se puede resolver → devuelve null.
 *
 * IMPORTANTE:
 * - Esta función asume que `locals` viene de tu capa SSR/middleware
 *   y que incluye datos de sesión/usuario.
 * - Esta función NO valida permisos. Sólo identifica o crea al técnico.
 *
 * @param locals - Objeto con info de request/usuario inyectado en Astro.locals
 * @returns Autor existente o recién creado, o null si no se pudo resolver.
 */
export async function resolverAutor(locals: any): Promise<Autor | null> {
  // 1) Intentar por ID directo (locals.tecnico_id)
  const tecnicoId = Number(locals?.tecnico_id);
  if (Number.isFinite(tecnicoId) && tecnicoId > 0) {
    const { data } = await supabase
      .from('tecnicos')
      .select('id, nombre, apellido, activo')
      .eq('id', tecnicoId)
      .maybeSingle();

    if (data?.id) {
      // devolvemos directamente lo que vino de la DB,
      // casteado a Autor para que quede tipado
      return data as Autor;
    }
  }

  // 2) Intentar por email (de distintos orígenes posibles en locals)
  //    Nota: priorizamos .user.email, pero soportamos .perfil.email y .usuario.email
  const userEmail: string | null =
    locals?.user?.email ||
    locals?.perfil?.email ||
    locals?.usuario?.email ||
    null;

  // Si ni siquiera tenemos email, ya no podemos seguir.
  if (!userEmail) return null;

  {
    // Buscamos si ya existe un técnico con ese email
    // .ilike hace comparación case-insensitive.
    const { data } = await supabase
      .from('tecnicos')
      .select('id, nombre, apellido, activo')
      .ilike('email', userEmail)
      .maybeSingle();

    if (data?.id) {
      return data as Autor;
    }
  }

  // 3) No existe el técnico → lo creamos automáticamente.
  //    deriveNameFromEmail() intenta sacar nombre y apellido legibles del email.
  const { nombre, apellido } = deriveNameFromEmail(userEmail);

  const { data: created } = await supabase
    .from('tecnicos')
    .insert({
      nombre,
      apellido,
      email: userEmail,
      activo: true,
    })
    .select('id, nombre, apellido, activo')
    .single();

  // created puede ser undefined si supabase falló silenciosamente.
  // devolvemos el creado o null si algo raro pasó.
  return (created as Autor) ?? null;
}

/**
 * nombreAutor(autor)
 * --------------------------------------------------
 * Devuelve el nombre completo para mostrar en UI/logs/etc.
 * Si no hay nombre ni apellido, usa "Técnico".
 *
 * Ejemplos:
 *   { nombre: 'Juan', apellido: 'Pérez' } → "Juan Pérez"
 *   { nombre: 'María' } → "María"
 *   undefined / null → "Técnico"
 *
 * @param autor - Algo que tenga al menos nombre y/o apellido (o null/undefined)
 * @returns nombre completo listo para mostrar
 */
export function nombreAutor(
  autor?: Pick<Autor, 'nombre' | 'apellido'> | null
): string {
  return (
    `${autor?.nombre ?? ''} ${autor?.apellido ?? ''}`.trim() || 'Técnico'
  );
}

/**
 * deriveNameFromEmail(email)
 * --------------------------------------------------
 * A partir de una dirección de email, intenta inferir:
 *   - nombre
 *   - apellido
 *
 * Regla:
 *   - Tomamos la parte antes de la @ (local-part).
 *   - La separamos por ".", "_", "-" para intentar obtener nombre y apellido.
 *   - Capitalizamos cada uno: "juan.perez" → "Juan Pérez".
 *
 * Si no hay separador claro (ej: "soporte"), devolvemos eso como nombre
 * y apellido vacío.
 *
 * Ejemplos:
 *   "juan.perez@example.com" → { nombre: "Juan", apellido: "Perez" }
 *   "maria@example.com"      → { nombre: "Maria", apellido: "" }
 *
 * @param email string
 * @returns { nombre: string; apellido: string }
 */
function deriveNameFromEmail(email: string): {
  nombre: string;
  apellido: string;
} {
  // Local-part = todo antes del "@"
  // Si no hay nada antes del "@", usamos "Usuario".
  const local = email.split('@')[0] || 'Usuario';

  // Intentamos cortar por ".", "_" o "-" para encontrar partes tipo nombre/apellido
  const parts = local.split(/[._-]+/).filter(Boolean);

  if (parts.length >= 2) {
    // Caso típico: "juan.perez"
    return {
      nombre: capitalize(parts[0]),
      apellido: capitalize(parts[1]),
    };
  }

  // Caso fallback: sólo una palabra tipo "juan" o "soporte"
  return {
    nombre: capitalize(local),
    apellido: '',
  };
}

/**
 * capitalize(s)
 * --------------------------------------------------
 * Convierte la primera letra a mayúscula y deja el resto igual.
 *
 * Ejemplo:
 *   "juan" → "Juan"
 *   ""     → ""
 *
 * @param s string crudo
 * @returns string con primera letra capitalizada
 */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
