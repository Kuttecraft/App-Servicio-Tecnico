import { supabase } from '../../lib/supabase';

export async function POST(context: RequestContext) {
  const req = context.request;

  const formData = await req.formData();
  const imagenArchivo = formData.get("imagenArchivo") as File | null;

  // Extraer campos como string
  const fields: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      fields[key] = value;
    }
  });

  const nuevoTicket: any = {
    ...fields,
    cubreGarantia: fields.cubreGarantia === 'true',
    cobrado: fields.cobrado === 'true',
    monto: isNaN(parseFloat(fields.monto)) ? 0 : parseFloat(fields.monto),
    fechaFormulario: new Date().toISOString(),
  };

  // Insertar ticket 
  const { data, error } = await supabase
    .from('TestImpresoras')
    .insert([nuevoTicket])
    .select()
    .single();

  if (error || !data) {
    return new Response(JSON.stringify({ error: error?.message || 'Error al insertar ticket' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = data.id;

  // Subida de imagen con nombre fijo {id}.jpg
  if (imagenArchivo && imagenArchivo.size > 0) {
    const nombreArchivo = `public/${id}.webp`;

    const { error: uploadError } = await supabase.storage
      .from('imagenes')
      .upload(nombreArchivo, imagenArchivo, {
        cacheControl: '3600',
        upsert: true, // sobrescribir si ya existe
      });

    if (uploadError) {
      return new Response(JSON.stringify({ error: `Error al subir imagen: ${uploadError.message}` }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data: publicUrl } = supabase.storage
      .from('imagenes')
      .getPublicUrl(nombreArchivo);

    // Actualizar ticket con la URL de la imagen
    await supabase
      .from('TestImpresoras')
      .update({ imagen: publicUrl.publicUrl })
      .eq('id', id);
  }

  // Redirigir al detalle del ticket
  return new Response(null, {
    status: 303,
    headers: { Location: `/detalle/${id}` },
  });
}

// Tipado para Astro server
interface RequestContext {
  request: Request;
  params: Record<string, string>;
  url: URL;
  site: URL | undefined;
}
