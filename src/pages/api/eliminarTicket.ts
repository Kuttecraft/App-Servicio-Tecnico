import { supabase } from '../../lib/supabase';


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
  const { data, error: fetchError } = await supabase
    .from('TestImpresoras')
    .select('imagen')
    .eq('id', id)
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
      // Extraer bucket y ruta del archivo
      const match = data.imagen.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
      if (match) {
        const bucket = match[1];
        const filePath = match[2];

        // Eliminar imagen del Storage
        const { error: storageError } = await supabase.storage.from(bucket).remove([filePath]);
        if (storageError) {
          // No detiene el proceso, pero lo loguea
          console.error('Error eliminando imagen del Storage:', storageError.message);
        }
      }
    } catch (e) {
      // Manejo de errores por si no matchea la URL
      console.error('No se pudo parsear la URL de la imagen:', e);
    }
  }

  // 3. Eliminar el registro
  const { error } = await supabase
    .from('TestImpresoras')
    .delete()
    .eq('id', id);

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


// Tipado para Astro server output
interface RequestContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  site: URL | undefined;
}
