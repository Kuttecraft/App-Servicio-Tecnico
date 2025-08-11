import { supabase } from '../../lib/supabase';

// Tipado para Astro server output
interface RequestContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  site: URL | undefined;
}

export async function POST(context: RequestContext) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID no proporcionado' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Helper para extraer bucket y ruta desde una URL pública de Supabase Storage.
  // Ej: https://xxxx.supabase.co/storage/v1/object/public/<bucket>/<path>
  function extraerBucketYPath(desdeUrl: string): { bucket: string; filePath: string } | null {
    // Quitar querystring (p.ej. '?t=123') por si vino cache-buster
    const sinQS = (desdeUrl || '').split('?')[0];
    const m = sinQS.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (m) return { bucket: m[1], filePath: m[2] };
    return null;
  }

  // Helper para intentar eliminar una imagen dada una URL pública o una ruta simple
  async function eliminarImagenDeStorage(valor: string | null) {
    if (!valor) return;

    try {
      // 1) Caso URL pública
      const parsed = extraerBucketYPath(valor);
      if (parsed) {
        const { error: storageError } = await supabase.storage
          .from(parsed.bucket)
          .remove([parsed.filePath]);
        if (storageError) {
          console.error('Error eliminando imagen del Storage:', storageError.message, parsed);
        }
        return;
      }

      // 2) Caso: guardaste una "ruta simple" en la DB en lugar de la URL pública
      // Intento heurístico simple: si no es http, probamos con un bucket por defecto
      if (!/^https?:\/\//i.test(valor)) {
        const defaultBucket = 'imagenes'; // ⚠️ ajustá si tu bucket real es otro
        const { error: storageError2 } = await supabase.storage
          .from(defaultBucket)
          .remove([valor]);
        if (storageError2) {
          console.error('Error eliminando imagen del Storage (ruta simple):', storageError2.message, { defaultBucket, valor });
        }
      }
    } catch (e) {
      // Manejo de errores por si no matchea la URL
      console.error('No se pudo procesar/eliminar la imagen:', valor, e);
    }
  }

  // 1. Buscar el registro para obtener la URL de la imagen
  //    IMPORTANTE: ahora buscamos en 'tickets_mian' (no en TestImpresoras)
  //    Además, traemos imagen, imagen_ticket e imagen_extra
  const { data, error: fetchError } = await supabase
    .from('tickets_mian')
    .select('imagen, imagen_ticket, imagen_extra')
    .eq('id', Number(id))
    .single();

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Si existen imágenes, eliminar del Storage (todas las que haya)
  if (data) {
    await Promise.all([
      eliminarImagenDeStorage(data.imagen),
      eliminarImagenDeStorage(data.imagen_ticket),
      eliminarImagenDeStorage(data.imagen_extra),
    ]);
  }

  // 3. Eliminar el registro
  //    OJO: 'presupuestos' y 'delivery' tienen FK a tickets_mian con ON DELETE CASCADE,
  //    así que se borran solos al eliminar el ticket aquí.
  const { error } = await supabase
    .from('tickets_mian')
    .delete()
    .eq('id', Number(id));

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ message: 'Ticket e imágenes eliminados correctamente' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
