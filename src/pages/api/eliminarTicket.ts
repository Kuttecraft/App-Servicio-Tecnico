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

  // 1. Buscar el registro para obtener la URL de la imagen
  //    IMPORTANTE: ahora buscamos en 'tickets_mian' (no en TestImpresoras)
  const { data, error: fetchError } = await supabase
    .from('tickets_mian')
    .select('imagen')
    .eq('id', Number(id))
    .single();

  if (fetchError) {
    return new Response(JSON.stringify({ error: fetchError.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. Si existe imagen, eliminar del Storage
  if (data && data.imagen) {
    // Supongamos que guardás en la DB algo así como: https://xxxx.supabase.co/storage/v1/object/public/<bucket>/<path>
    try {
      // Quitar querystring (p.ej. '?t=123') por si vino cache-buster
      const imagenSinQS = data.imagen.split('?')[0];

      // Extraer bucket y ruta del archivo
      const match = imagenSinQS.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
      if (match) {
        const bucket = match[1];
        const filePath = match[2];

        // Eliminar imagen del Storage
        const { error: storageError } = await supabase.storage.from(bucket).remove([filePath]);
        if (storageError) {
          // No detiene el proceso, pero lo loguea
          console.error('Error eliminando imagen del Storage:', storageError.message);
        }
      } else {
        // Manejo de caso: si en la DB guardaste solo la "ruta" (bucket/path) en lugar de la URL pública
        // Ejemplos válidos: 'tickets/123/imagen.jpg' con bucket 'tickets'
        // Intento heurístico simple: si no matchea la URL pública, probamos con un bucket por defecto
        // Ajustá 'tickets' si tu bucket real se llama de otra forma
        const posibleRuta = imagenSinQS;
        if (!posibleRuta.startsWith('http')) {
          const defaultBucket = 'tickets';
          const { error: storageError2 } = await supabase.storage.from(defaultBucket).remove([posibleRuta]);
          if (storageError2) {
            console.error('Error eliminando imagen del Storage (ruta simple):', storageError2.message);
          }
        }
      }
    } catch (e) {
      // Manejo de errores por si no matchea la URL
      console.error('No se pudo parsear la URL de la imagen:', e);
    }
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

  return new Response(JSON.stringify({ message: 'Ticket e imagen eliminados correctamente' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
