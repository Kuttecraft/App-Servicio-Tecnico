import type { APIRoute } from 'astro';
import { supabase } from '../../lib/supabase';

export const POST: APIRoute = async ({ request, locals }) => {
  // ✅ Solo admins
  const perfil = (locals as any)?.perfil as { rol?: string; admin?: boolean } | undefined;
  const isAdmin = (perfil?.rol === 'admin') || (perfil?.admin === true);
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Permisos insuficientes' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID no proporcionado' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Helpers ---
  function extraerBucketYPath(desdeUrl: string): { bucket: string; filePath: string } | null {
    const sinQS = (desdeUrl || '').split('?')[0];
    const m = sinQS.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    return m ? { bucket: m[1], filePath: m[2] } : null;
  }

  async function eliminarImagenDeStorage(valor: string | null) {
    if (!valor) return;
    try {
      const parsed = extraerBucketYPath(valor);
      if (parsed) {
        const { error: storageError } = await supabase.storage.from(parsed.bucket).remove([parsed.filePath]);
        if (storageError) console.error('Error eliminando imagen del Storage:', storageError.message, parsed);
        return;
      }
      if (!/^https?:\/\//i.test(valor)) {
        const defaultBucket = 'imagenes'; // ajustá si tu bucket es otro
        const { error: storageError2 } = await supabase.storage.from(defaultBucket).remove([valor]);
        if (storageError2) console.error('Error eliminando imagen del Storage (ruta simple):', storageError2.message, { defaultBucket, valor });
      }
    } catch (e) {
      console.error('No se pudo procesar/eliminar la imagen:', valor, e);
    }
  }

  // 1) Traer imágenes del ticket
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

  // 2) Eliminar imágenes si las hay
  if (data) {
    await Promise.all([
      eliminarImagenDeStorage(data.imagen),
      eliminarImagenDeStorage(data.imagen_ticket),
      eliminarImagenDeStorage(data.imagen_extra),
    ]);
  }

  // 3) Eliminar el ticket (presupuestos/delivery caen por CASCADE)
  const { error } = await supabase.from('tickets_mian').delete().eq('id', Number(id));
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
};
