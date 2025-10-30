// src/pages/api/eliminarTicket.ts

import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

/**
 * POST /api/eliminarTicket?id=123
 * ------------------------------------------------------------------
 * Elimina un ticket (y sus imágenes asociadas) SI y SOLO SI el usuario es admin.
 *
 * Flujo:
 * 1. Verificamos permisos en `locals` (tu middleware mete perfil ahí).
 * 2. Leemos el ID del ticket desde el querystring (?id=123).
 * 3. Buscamos las URLs de las imágenes guardadas en el ticket.
 * 4. Borramos esas imágenes del Storage de Supabase.
 * 5. Borramos la fila de `tickets_mian`.
 *
 * Notas importantes:
 * - Asumimos que tablas relacionadas (`delivery`, `presupuestos`,
 *   `ticket_comentarios`, etc.) tienen ON DELETE CASCADE en la DB.
 * - Si no hay CASCADE, las filas hijas quedarían "huérfanas". Eso hay
 *   que resolverlo con constraints en la base, no acá.
 * - Para eliminar imágenes usamos la URL pública almacenada en el ticket
 *   y tratamos de derivar bucket + path interno a partir de esa URL.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  // ======================================================
  // 0. Autorización: solo admins pueden borrar tickets
  // ======================================================

  // Tu middleware mete info de perfil en locals.
  // Aceptamos dos formas de marcar admin:
  //   - perfil.rol === 'admin'
  //   - perfil.admin === true
  const perfil = (locals as any)?.perfil as
    | { rol?: string; admin?: boolean }
    | undefined;

  const isAdmin =
    (perfil?.rol === 'admin') || (perfil?.admin === true);

  if (!isAdmin) {
    // 🚫 No autorizado
    return new Response(
      JSON.stringify({ error: 'Permisos insuficientes' }),
      {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // ======================================================
  // 1. Obtener ID del ticket desde la URL (?id=123)
  // ======================================================
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    // Falta el parámetro obligatorio
    return new Response(
      JSON.stringify({ error: 'ID no proporcionado' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Hacemos Number(id) al momento de usarlo, para estar seguros,
  // pero todavía no frenamos acá si por ejemplo es "123abc".
  // Ese caso fallaría después en la query a Supabase.

  // ======================================================
  // 2. Helpers internos
  // ======================================================

  /**
   * extraerBucketYPath(desdeUrl)
   * ------------------------------------------------------
   * Intenta leer de una URL pública de Supabase Storage el bucket y
   * la ruta interna del archivo para poder borrarlo.
   *
   * Ejemplo de URL pública típica de Supabase:
   *   https://<tu-proyecto>.supabase.co/storage/v1/object/public/imagenes/public/123.webp
   *
   * patrón que matcheamos:
   *   /storage/v1/object/public/<bucket>/<filePath...>
   *
   * Devuelve:
   *   { bucket: 'imagenes', filePath: 'public/123.webp' }
   *
   * Devuelve null si no puede parsearlo.
   */
  function extraerBucketYPath(
    desdeUrl: string
  ): { bucket: string; filePath: string } | null {
    // Ignoramos querystrings (?t=...) porque pueden venir cache-busters
    const sinQS = (desdeUrl || '').split('?')[0];

    // Buscamos el patrón /storage/v1/object/public/<bucket>/<resto>
    const m = sinQS.match(
      /\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/
    );

    return m
      ? { bucket: m[1], filePath: m[2] }
      : null;
  }

  /**
   * eliminarImagenDeStorage(valor)
   * ------------------------------------------------------
   * Borra un archivo en el bucket de Supabase Storage.
   *
   * Cómo decide qué borrar:
   * - Si `valor` parece ser una URL pública completa:
   *     → usamos extraerBucketYPath() para recuperar bucket y path
   *       reales en el storage, y borramos eso.
   *
   * - Si `valor` NO es URL (por ejemplo sólo "public/123.webp"):
   *     → asumimos que el bucket es "imagenes" (ajustable abajo)
   *       y borramos esa ruta tal cual.
   *
   * - Si `valor` es falsy (null/undefined/''), no hace nada.
   *
   * Casos de error no frenan el flujo: sólo los logueamos.
   */
  async function eliminarImagenDeStorage(
    valor: string | null
  ) {
    if (!valor) return;

    try {
      // ¿Es URL pública completa?
      const parsed = extraerBucketYPath(valor);

      if (parsed) {
        // Caso URL real → ya tenemos bucket y filePath
        const { error: storageError } = await supabase.storage
          .from(parsed.bucket)
          .remove([parsed.filePath]);

        if (storageError) {
          console.error(
            'Error eliminando imagen del Storage:',
            storageError.message,
            parsed
          );
        }
        return;
      }

      // Si NO matcheó como URL, pero tampoco parece URL HTTP,
      // entonces puede ser que hayamos guardado sólo "public/123.webp".
      // En ese caso asumimos bucket "imagenes".
      if (!/^https?:\/\//i.test(valor)) {
        const defaultBucket = 'imagenes'; // <- cambiá esto si tu bucket se llama distinto
        const { error: storageError2 } = await supabase.storage
          .from(defaultBucket)
          .remove([valor]);

        if (storageError2) {
          console.error(
            'Error eliminando imagen del Storage (ruta simple):',
            storageError2.message,
            { defaultBucket, valor }
          );
        }
      }
    } catch (e) {
      // Falla silenciosa para no bloquear el borrado del ticket:
      console.error(
        'No se pudo procesar/eliminar la imagen del Storage:',
        valor,
        e
      );
    }
  }

  // ======================================================
  // 3. Traer info del ticket (para saber qué imágenes borrar)
  // ======================================================
  //
  // Necesitamos leer las columnas de imágenes de la fila antes de
  // eliminar el ticket, porque después de borrarlo ya no tendríamos
  // las URLs.
  //
  // Seleccionamos sólo las columnas que nos importan para cleanup.
  const {
    data,
    error: fetchError,
  } = await supabase
    .from('tickets_mian')
    .select('imagen, imagen_ticket, imagen_extra')
    .eq('id', Number(id))
    .single();

  if (fetchError) {
    // No pudimos leer el ticket (ID inválido, RLS, etc.)
    return new Response(
      JSON.stringify({ error: fetchError.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // ======================================================
  // 4. Borrar imágenes físicas del Storage
  // ======================================================
  //
  // Hacemos esto antes del DELETE del ticket porque:
  // - Queremos acceso a las URLs mientras todavía existen en la DB.
  // - Si eliminas primero el ticket, perderías la referencia para limpiar
  //   las imágenes en el bucket y quedan "huérfanas".
  if (data) {
    await Promise.all([
      eliminarImagenDeStorage(data.imagen),
      eliminarImagenDeStorage(data.imagen_ticket),
      eliminarImagenDeStorage(data.imagen_extra),
    ]);
  }

  // ======================================================
  // 5. Borrar el ticket en la tabla tickets_mian
  // ======================================================
  //
  // IMPORTANTE:
  //   Se asume que las tablas relacionadas (`delivery`,
  //   `presupuestos`, `ticket_comentarios`, etc.) están con
  //   ON DELETE CASCADE.
  //
  //   Eso significa que cuando borramos el ticket,
  //   la base de datos borra automáticamente lo relacionado.
  //
  //   Si no están con CASCADE en tu esquema, esas filas van a quedar
  //   vivas. Revisá esa parte en tu schema SQL.
  const { error } = await supabase
    .from('tickets_mian')
    .delete()
    .eq('id', Number(id));

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // ======================================================
  // 6. OK → devolver JSON de éxito
  // ======================================================
  //
  // Nota: esto NO hace redirect. Lo ideal es que el front,
  // después de llamar a este endpoint con fetch(),
  // refresque la lista de tickets o navegue donde quiera.
  return new Response(
    JSON.stringify({
      message:
        'Ticket e imágenes eliminados correctamente',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
