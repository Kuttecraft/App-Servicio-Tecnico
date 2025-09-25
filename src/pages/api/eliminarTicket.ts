// src/pages/api/eliminarTicket.ts

import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  // ✅ Solo admins: verificamos el perfil desde `locals` (inyectado por tu auth/middleware)
  const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
  const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);
  if (!isAdmin) {
    // Si no es admin, cortamos con 403
    return new Response(JSON.stringify({ error: 'Permisos insuficientes' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Obtenemos el ID del ticket a borrar desde el querystring (?id=123)
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    // Validación temprana: sin ID no podemos continuar
    return new Response(JSON.stringify({ error: 'ID no proporcionado' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Helpers ---

  /**
   * Dada una URL pública de Supabase Storage, intenta extraer:
   *  - bucket (p.ej. "imagenes")
   *  - filePath (p.ej. "public/123.webp")
   * Devuelve null si el formato no coincide con /storage/v1/object/public/...
   */
  function extraerBucketYPath(desdeUrl: string): { bucket: string; filePath: string } | null {
    const sinQS = (desdeUrl || '').split('?')[0]; // ignoramos querystring de firma si existe
    const m = sinQS.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    return m ? { bucket: m[1], filePath: m[2] } : null;
  }

  /**
   * Elimina un archivo de imagen del Storage si:
   *  - `valor` es una URL pública válida → extrae bucket y path y lo borra.
   *  - `valor` no es URL pero parece path simple → borra del bucket por defecto "imagenes".
   * Silencioso ante errores (los loguea en consola).
   */
  async function eliminarImagenDeStorage(valor: string | null) {
    if (!valor) return;
    try {
      const parsed = extraerBucketYPath(valor);
      if (parsed) {
        // Caso URL pública: tenemos bucket y filePath
        const { error: storageError } = await supabase.storage.from(parsed.bucket).remove([parsed.filePath]);
        if (storageError) console.error('Error eliminando imagen del Storage:', storageError.message, parsed);
        return;
      }
      // Caso path simple (no URL): intentamos en bucket por defecto
      if (!/^https?:\/\//i.test(valor)) {
        const defaultBucket = 'imagenes'; // ajustá si tu bucket es otro
        const { error: storageError2 } = await supabase.storage.from(defaultBucket).remove([valor]);
        if (storageError2) console.error('Error eliminando imagen del Storage (ruta simple):', storageError2.message, { defaultBucket, valor });
      }
    } catch (e) {
      console.error('No se pudo procesar/eliminar la imagen:', valor, e);
    }
  }

  // 1) Traer las URLs de imágenes asociadas al ticket para poder eliminarlas luego
  const { data, error: fetchError } = await supabase
    .from('tickets_mian')
    .select('imagen, imagen_ticket, imagen_extra')
    .eq('id', Number(id))
    .single();

  if (fetchError) {
    // Si no pudimos leer la fila, abortamos
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2) Eliminar las imágenes del Storage (si había)
  if (data) {
    await Promise.all([
      eliminarImagenDeStorage(data.imagen),
      eliminarImagenDeStorage(data.imagen_ticket),
      eliminarImagenDeStorage(data.imagen_extra),
    ]);
  }

  // 3) Eliminar el ticket en sí. Se asume que relaciones como presupuestos/delivery
  //    están definidas con ON DELETE CASCADE en la base de datos.
  const { error } = await supabase.from('tickets_mian').delete().eq('id', Number(id));
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // OK
  return new Response(JSON.stringify({ message: 'Ticket e imágenes eliminados correctamente' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
